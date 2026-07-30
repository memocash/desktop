const crypto = require("crypto")

// bitcoincashjs2-lib asks OpenSSL for the historical rmd160 alias. Electron's
// BoringSSL only exposes ripemd160, so normalize it before loading the library.
const originalCreateHash = crypto.createHash
crypto.createHash = (algorithm, options) =>
    originalCreateHash.call(crypto, algorithm === "rmd160" ? "ripemd160" : algorithm, options)

const bitcoin = require("@bitcoin-dot-com/bitcoincashjs2-lib")
const {mnemonicToSeedSync} = require("bip39")
const {BIP32Factory} = require("bip32")
const ecc = require("tiny-secp256k1")
const {WalletErrors} = require("../common/util")

const bip32 = BIP32Factory(ecc)
const MaxFeeRate = 100
const MaxBeatHashAttempts = 4096
const DustLimit = 546

const walletAddresses = (wallet) =>
    (wallet.addresses || []).concat(wallet.changeList || [], wallet.slpList || [])

const keyForAddress = (wallet, address, seedRoot) => {
    for (const wif of wallet.keys || []) {
        const key = bitcoin.ECPair.fromWIF(wif)
        if (key.getAddress() === address) {
            return key
        }
    }
    const node = seedRoot()
    if (!node) {
        return undefined
    }
    const lists = [
        {addresses: wallet.addresses || [], path: "m/44'/0'/0'/0/"},
        {addresses: wallet.changeList || [], path: "m/44'/0'/0'/1/"},
        {addresses: wallet.slpList || [], path: "m/44'/245'/0'/0/"},
    ]
    for (const {addresses, path} of lists) {
        const index = addresses.indexOf(address)
        if (index === -1) {
            continue
        }
        // A list position is not proof of derivation: a watch-only address, or
        // one a renderer added to a list, sits at an index whose derived key
        // belongs to some other address. Signing with it would produce a
        // transaction no node accepts, so treat a mismatch as no key at all.
        const key = bitcoin.ECPair.fromWIF(node.derivePath(path + index).toWIF())
        if (key.getAddress() === address) {
            return key
        }
    }
}

// Answering "does this wallet hold the key for this address" costs a PBKDF2 pass
// over the mnemonic and a derivation, and one transaction asks about the same
// addresses several times - once per input, once per output. Build the root and
// remember each answer for the duration of the signing.
const keyFinder = (wallet) => {
    const answers = new Map()
    let root
    const seedRoot = () => {
        if (root === undefined) {
            root = wallet.seed ? bip32.fromSeed(mnemonicToSeedSync(wallet.seed)) : null
        }
        return root
    }
    return (address) => {
        if (!answers.has(address)) {
            answers.set(address, keyForAddress(wallet, address, seedRoot))
        }
        return answers.get(address)
    }
}

const validateInteger = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("invalid " + name)
    }
}

const uint64 = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length !== 8) {
        throw new Error("invalid SLP amount")
    }
    return BigInt("0x" + buffer.toString("hex"))
}

// bitcoinjs normalizes a minimal single-byte push back into its opcode, so the
// MINT baton field arrives as OP_0 when the baton is being destroyed, as OP_1 to
// OP_16 for the usual output indexes, and as a one-byte push beyond that.
const batonOutput = (chunk) => {
    if (chunk === bitcoin.opcodes.OP_0) {
        return undefined
    }
    if (typeof chunk === "number" &&
        chunk >= bitcoin.opcodes.OP_1 && chunk <= bitcoin.opcodes.OP_16) {
        return chunk - bitcoin.opcodes.OP_1 + 1
    }
    if (Buffer.isBuffer(chunk) && chunk.length === 1) {
        return chunk[0]
    }
    throw new Error("invalid SLP MINT baton output")
}

// Validates the SLP framing against the authoritative token inputs and reports
// what each output carries: a token amount, the mint baton, or both. The person
// approving a send is told about the tokens and the mint authority moving, not
// just about the dust carrying them.
const validateSlp = (tx, authoritative) => {
    const tokenInputs = authoritative.filter(({output}) => output.slp_token_hash)
    const batonInputs = authoritative.filter(({output}) => output.slp_baton_token_hash)
    if (!tokenInputs.length && !batonInputs.length) {
        return new Map()
    }
    const chunks = bitcoin.script.decompile(tx.outs[0] && tx.outs[0].script)
    if (!chunks || chunks[0] !== bitcoin.opcodes.OP_RETURN ||
        !Buffer.isBuffer(chunks[1]) || chunks[1].toString("hex") !== "534c5000" ||
        !Buffer.isBuffer(chunks[3])) {
        throw new Error("token inputs require a valid SLP transaction")
    }
    const action = chunks[3].toString("ascii")
    if (action === "SEND") {
        if (batonInputs.length || !Buffer.isBuffer(chunks[4]) || chunks.length < 6) {
            throw new Error("invalid SLP SEND")
        }
        const tokenHash = chunks[4].toString("hex")
        if (tokenInputs.some(({output}) => output.slp_token_hash !== tokenHash)) {
            throw new Error("SLP SEND token does not match its inputs")
        }
        const inputAmount = tokenInputs.reduce(
            (sum, {output}) => sum + BigInt(output.slp_amount), 0n)
        const amounts = chunks.slice(5).map(uint64)
        if (amounts.reduce((sum, amount) => sum + amount, 0n) !== inputAmount) {
            throw new Error("SLP SEND does not preserve its input amount")
        }
        if (amounts.some((amount, index) =>
            amount > 0n && (!tx.outs[index + 1] || tx.outs[index + 1].value !== DustLimit))) {
            throw new Error("SLP SEND output does not match its token amount")
        }
        // Amount n in the OP_RETURN belongs to output n + 1, the OP_RETURN
        // itself being output 0.
        return new Map(amounts
            .map((amount, index) => [index + 1, {amount}])
            .filter(([, {amount}]) => amount > 0n))
    }
    if (action === "MINT") {
        if (tokenInputs.length || !batonInputs.length || !Buffer.isBuffer(chunks[4])) {
            throw new Error("invalid SLP MINT")
        }
        const tokenHash = chunks[4].toString("hex")
        if (batonInputs.some(({output}) => output.slp_baton_token_hash !== tokenHash)) {
            throw new Error("SLP MINT baton does not match its token")
        }
        // The minted quantity always goes to output 1. The baton field either
        // names the output that keeps the authority to mint more - which the
        // format puts at 2 or later - or is empty, destroying it.
        const carried = new Map([[1, {amount: uint64(chunks[6])}]])
        if (!tx.outs[1]) {
            throw new Error("SLP MINT has no output for the minted tokens")
        }
        const baton = batonOutput(chunks[5])
        if (baton !== undefined) {
            if (baton < 2 || !tx.outs[baton]) {
                throw new Error("SLP MINT baton names an output the transaction does not have")
            }
            carried.set(baton, {baton: true})
        }
        return carried
    }
    throw new Error("unsupported SLP action for token inputs")
}

// The outputs that leave the wallet: everything except a valueless data carrier
// and everything except payments the wallet can spend again. An output whose
// script names no address counts as leaving, since nothing establishes that the
// wallet can spend it - and so does an OP_RETURN carrying value, which is a way
// to destroy coins rather than to send them.
//
// Staying in the wallet means main can produce the key, not that the address
// appears in the wallet's address lists. Those lists are public metadata that a
// renderer updates without a password, so treating them as ownership would let a
// compromised one list an address it controls and have its own payments
// classified as change.
const outsidePayments = (tx, findKey, tokenOutputs) => {
    const payments = []
    for (let index = 0; index < tx.outs.length; index++) {
        const {script, value} = tx.outs[index]
        const chunks = bitcoin.script.decompile(script)
        if (chunks && chunks[0] === bitcoin.opcodes.OP_RETURN && value === 0) {
            continue
        }
        let address
        try {
            address = bitcoin.address.fromOutputScript(script)
        } catch (e) {
            address = undefined
        }
        if (address && findKey(address)) {
            continue
        }
        const token = tokenOutputs.get(index) || {}
        payments.push({
            address,
            value,
            tokenAmount: token.amount === undefined ? undefined : token.amount.toString(),
            baton: token.baton === true,
        })
    }
    return payments
}

const SignTransaction = async ({raw, inputs, beatHash, wallet, getOutput, authorizeSpend, confirmSpend}) => {
    if (!wallet.seed && !(wallet.keys && wallet.keys.length)) {
        throw new Error("watch-only-wallet")
    }
    if (!Array.isArray(inputs) || !inputs.length) {
        throw new Error("transaction has no inputs")
    }
    const tx = bitcoin.Transaction.fromBuffer(Buffer.from(raw, "hex"))
    if (tx.ins.length !== inputs.length) {
        throw new Error("input metadata count does not match transaction")
    }

    const owned = new Set(walletAddresses(wallet))
    const findKey = keyFinder(wallet)
    const authoritative = []
    const seenInputs = new Set()
    let inputValue = 0
    for (let i = 0; i < inputs.length; i++) {
        const request = inputs[i]
        if (!request || !/^[0-9a-f]{64}$/i.test(request.prev_hash) ||
            !Number.isInteger(request.prev_index) || request.prev_index < 0) {
            throw new Error("invalid input reference")
        }
        const rawHash = Buffer.from(tx.ins[i].hash).reverse().toString("hex")
        if (rawHash !== request.prev_hash.toLowerCase() || tx.ins[i].index !== request.prev_index) {
            throw new Error("input metadata does not match transaction")
        }
        const outpoint = request.prev_hash.toLowerCase() + ":" + request.prev_index
        if (seenInputs.has(outpoint)) {
            throw new Error("transaction contains a duplicate input")
        }
        seenInputs.add(outpoint)
        const output = await getOutput(request.prev_hash, request.prev_index)
        if (!output) {
            throw new Error("input output is not in the local database")
        }
        validateInteger(output.value, "input value")
        if (!owned.has(output.address)) {
            throw new Error("input does not belong to this wallet")
        }
        const expectedScript = bitcoin.address.toOutputScript(output.address)
        if (output.script && Buffer.from(output.script, "hex").compare(expectedScript) !== 0) {
            throw new Error("input script does not match its address")
        }
        const key = findKey(output.address)
        if (!key) {
            throw new Error("no private key for input address")
        }
        authoritative.push({output, key})
        inputValue += output.value
    }

    let outputValue = 0
    for (const output of tx.outs) {
        validateInteger(output.value, "output value")
        outputValue += output.value
    }
    const fee = inputValue - outputValue
    if (fee < 0) {
        throw new Error("transaction spends more than its inputs")
    }
    // A P2PKH signature adds roughly 107 bytes per input. Reject absurd fees
    // before asking the transaction library to build, both for a stable error
    // and to avoid doing needless private-key work.
    const estimatedSignedSize = Buffer.from(raw, "hex").length + inputs.length * 107
    if (fee / estimatedSignedSize > MaxFeeRate) {
        throw new Error("transaction fee rate exceeds safety limit")
    }
    const tokenOutputs = validateSlp(tx, authoritative)

    // Everything above establishes that the inputs are this wallet's to spend.
    // None of it says anything about where the money goes: the outputs arrive
    // already built, and a renderer that can ask for a signature can ask for one
    // paying anyone. So whoever calls this has to obtain agreement to the
    // destinations first, and a caller that offers no way to ask doesn't get to
    // move funds outside the wallet at all.
    const payments = outsidePayments(tx, findKey, tokenOutputs)
    // What this takes out of the wallet: everything paid where the wallet can't
    // spend it again, plus the fee. Change is not spent, and neither is a data
    // output. Known before any key work, so a caller that meters spending can
    // refuse from the authoritative figure rather than from anything the
    // renderer offered - and refuse before anyone is asked to confirm a
    // transaction that isn't going to be signed.
    const outgoing = payments.reduce((total, {value}) => total + value, 0) + fee
    const carriesTokens = payments.some(({tokenAmount, baton}) => !!tokenAmount || baton)
    if (typeof authorizeSpend === "function" && !authorizeSpend({outgoing, carriesTokens})) {
        throw new Error(WalletErrors.PasswordRequired)
    }
    if (payments.length) {
        if (typeof confirmSpend !== "function") {
            throw new Error("a payment leaving the wallet needs confirmation")
        }
        if (!await confirmSpend({payments, fee})) {
            throw new Error(WalletErrors.SpendCancelled)
        }
    }

    let signed
    for (let attempt = 0; attempt < MaxBeatHashAttempts; attempt++) {
        const txb = bitcoin.TransactionBuilder.fromTransaction(tx)
        for (let i = 0; i < authoritative.length; i++) {
            txb.sign(i, authoritative[i].key, undefined,
                bitcoin.Transaction.SIGHASH_ALL, authoritative[i].output.value)
        }
        signed = txb.build()
        if (!beatHash || signed.getId() > beatHash) {
            break
        }
        tx.locktime = 500000000 + attempt
    }
    if (beatHash && signed.getId() <= beatHash) {
        throw new Error("unable to satisfy transaction ordering constraint")
    }
    const signedRaw = signed.toBuffer()
    const feeRate = fee / signedRaw.length
    if (feeRate > MaxFeeRate) {
        throw new Error("transaction fee rate exceeds safety limit")
    }
    return {
        raw: signedRaw.toString("hex"),
        size: signedRaw.length,
        txid: signed.getId(),
        fee,
        feeRate,
        outgoing,
        carriesTokens,
        inputs: authoritative.map(({output}) => ({
            address: output.address,
            value: output.value,
        })),
    }
}

module.exports = {
    KeyFinder: keyFinder,
    MaxFeeRate,
    SignTransaction,
}
