// Derivation owns the paths a wallet's addresses come from.
const {AccountPath, Bip32} = require("./derivation")

const {mnemonicToSeedSync} = require("bip39")
const {WalletErrors} = require("../common/util")
const {ECPair, ScriptSignature} = require("../common/bitcoin/ecpair")
const {Transaction} = require("../common/bitcoin/transaction")
const baddress = require("../common/bitcoin/address")
const bscript = require("../common/bitcoin/script")
const opcodes = require("../common/bitcoin/opcodes.json")

// Every signature this wallet grants: SIGHASH_ALL over the BIP143 preimage
// with BCH's forkid bit, 0x41 on the wire.
const SigHashType = Transaction.SIGHASH_ALL | Transaction.SIGHASH_BITCOINCASHBIP143

const MaxFeeRate = 100
// Every attempt re-signs all the inputs, synchronously on the main process's
// thread, so this cap is what bounds how long every window in the app can
// freeze. Against a real txid target each attempt beats it about half the
// time, so 32 tries fail roughly once in four billion; anything that ever
// needs more headroom belongs in a worker, not in a bigger number here.
const MaxBeatHashAttempts = 32
const DustLimit = 546

const walletAddresses = (wallet) =>
    (wallet.addresses || []).concat(wallet.changeList || [], wallet.slpList || [])

const keyForAddress = (wallet, address, seedRoot) => {
    for (const wif of wallet.keys || []) {
        const key = ECPair.fromWIF(wif)
        if (key.getAddress() === address) {
            return key
        }
    }
    const node = seedRoot()
    if (!node) {
        return undefined
    }
    const lists = [
        {addresses: wallet.addresses || [], path: AccountPath.bch + "/0/"},
        {addresses: wallet.changeList || [], path: AccountPath.bch + "/1/"},
        {addresses: wallet.slpList || [], path: AccountPath.slp + "/0/"},
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
        const key = ECPair.fromWIF(node.derivePath(path + index).toWIF())
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
            root = wallet.seed ? Bip32.fromSeed(mnemonicToSeedSync(wallet.seed)) : null
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

// A stored token amount above Number.MAX_SAFE_INTEGER is not the on-chain
// amount, only the nearest float JSON and sqlite could carry. A SEND balanced
// against it claims more or less than the inputs really hold - claiming more is
// SLP-invalid and burns every token input - so an amount this process cannot
// represent exactly is an amount it refuses to spend.
const slpInputAmount = (output) => {
    if (typeof output.slp_amount === "number" && !Number.isSafeInteger(output.slp_amount)) {
        throw new Error("token input amount is too large to represent exactly")
    }
    return BigInt(output.slp_amount)
}

// The 1-2 byte token type field, as consensus validators read it. bitcoinjs
// re-minimalizes small pushes (see batonOutput below), so the field can arrive
// as an opcode: OP_1..OP_16 for 1-16, and OP_1NEGATE for a lone 0x81 byte -
// which in SLP's reading is the NFT1 group type, not negative one.
const slpTokenType = (chunk) => {
    if (typeof chunk === "number") {
        if (chunk >= opcodes.OP_1 && chunk <= opcodes.OP_16) {
            return chunk - opcodes.OP_1 + 1
        }
        if (chunk === opcodes.OP_1NEGATE) {
            return 0x81
        }
        throw new Error("invalid SLP token type")
    }
    if (Buffer.isBuffer(chunk) && chunk.length >= 1 && chunk.length <= 2) {
        return chunk.readUIntBE(0, chunk.length)
    }
    throw new Error("invalid SLP token type")
}

// bitcoinjs normalizes a minimal single-byte push back into its opcode, so the
// MINT baton field arrives as OP_0 when the baton is being destroyed, as OP_1 to
// OP_16 for the usual output indexes, and as a one-byte push beyond that.
const batonOutput = (chunk) => {
    if (chunk === opcodes.OP_0) {
        return undefined
    }
    if (typeof chunk === "number" &&
        chunk >= opcodes.OP_1 && chunk <= opcodes.OP_16) {
        return chunk - opcodes.OP_1 + 1
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
    const chunks = bscript.decompile(tx.outs[0] && tx.outs[0].script)
    if (!chunks || chunks[0] !== opcodes.OP_RETURN ||
        !Buffer.isBuffer(chunks[1]) || chunks[1].toString("hex") !== "534c5000" ||
        !Buffer.isBuffer(chunks[3])) {
        throw new Error("token inputs require a valid SLP transaction")
    }
    // The type byte is part of what consensus validators check: a SEND or MINT
    // whose declared type disagrees with the token's genesis is invalid on
    // chain, and invalid means every token input is burned. The type each
    // token was created with comes from the local genesis record, and an input
    // whose recorded type is missing is refused rather than guessed at.
    const declaredType = slpTokenType(chunks[2])
    for (const {output} of tokenInputs.concat(batonInputs)) {
        if (!Number.isInteger(output.slp_token_type)) {
            throw new Error("token input type is not known")
        }
        if (output.slp_token_type !== declaredType) {
            throw new Error("SLP token type does not match its inputs")
        }
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
            (sum, {output}) => sum + slpInputAmount(output), 0n)
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
// appears in the wallet's address lists. Those lists are public metadata: main
// refuses to add to them on a renderer's word once a wallet holds keys, but a
// renderer can still take entries out, and in neither direction are they proof
// of anything. A key is. The preview below does read them, because nothing can
// be derived until the wallet is open, and what it shows is checked against what
// this establishes before any signature is granted.
const outsidePayments = (tx, findKey, tokenOutputs) => {
    const payments = []
    for (let index = 0; index < tx.outs.length; index++) {
        const {script, value} = tx.outs[index]
        const chunks = bscript.decompile(script)
        if (chunks && chunks[0] === opcodes.OP_RETURN && value === 0) {
            continue
        }
        let address
        try {
            address = baddress.fromOutputScript(script)
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

// What a transaction takes out of the wallet and where it takes it, read from
// the authoritative prevout values rather than from anything the caller offered
// alongside them. Shared by signing and by the preview below, so the figures a
// person is shown and the ones a signature is granted against are worked out by
// the same code and can only differ where their answer to "is this address the
// wallet's own" differs.
const analyzeSpend = async ({raw, inputs, wallet, getOutput, findKey}) => {
    if (!Array.isArray(inputs) || !inputs.length) {
        throw new Error("transaction has no inputs")
    }
    const tx = Transaction.fromBuffer(Buffer.from(raw, "hex"))
    if (tx.ins.length !== inputs.length) {
        throw new Error("input metadata count does not match transaction")
    }

    const owned = new Set(walletAddresses(wallet))
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
        // The index's tx-level SLP verdict, carried on the row by GetOutput.
        // PENDING or no verdict at all means the output may carry tokens this
        // transaction would burn, so it is refused rather than spent (fail
        // closed). INVALID is a decided verdict: the transaction's plain
        // outputs are ordinary coins and spend normally.
        if (output.slp_validity !== "VALID" && output.slp_validity !== "NOT_SLP" &&
            output.slp_validity !== "INVALID") {
            throw new Error("input SLP validity is not established")
        }
        // A token or baton row on a transaction the index does not call VALID
        // carries nothing on chain. Spending it as a token input would build
        // an SLP transaction against phantom amounts - on-chain invalid,
        // burning every genuine token input beside it - and validateSlp below
        // reads the row as real, so the input is refused here instead.
        // Deliberately burning such outputs is #37.
        if ((output.slp_token_hash || output.slp_baton_token_hash) &&
            output.slp_validity !== "VALID") {
            throw new Error("token input is not SLP-valid")
        }
        validateInteger(output.value, "input value")
        if (!owned.has(output.address)) {
            throw new Error("input does not belong to this wallet")
        }
        const expectedScript = baddress.toOutputScript(output.address)
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
    return {tx, authoritative, fee, payments, outgoing, carriesTokens}
}

// The same reading of the transaction with the public address lists standing in
// for the keys, for showing someone what they are about to approve before the
// wallet has been decrypted - there is no seed to derive from until a password
// is in. A wallet that can sign derives its own addresses and main refuses to
// add any on a renderer's word, so the lists can only fall short of what the
// keys prove, never reach past it. Signing checks anyway: what comes back here
// is shown, and what the keys say is what the signature is granted against.
const PreviewSpend = async ({raw, inputs, wallet, getOutput}) => {
    const owned = new Set(walletAddresses(wallet))
    const {fee, payments} = await analyzeSpend({
        raw, inputs, wallet, getOutput, findKey: (address) => owned.has(address),
    })
    return {fee, payments}
}

const SignTransaction = async ({raw, inputs, beatHash, wallet, getOutput, authorizeSpend, confirmSpend}) => {
    if (!wallet.seed && !(wallet.keys && wallet.keys.length)) {
        throw new Error("watch-only-wallet")
    }
    // The ordering constraint arrives from the renderer and is compared as a
    // string against the lowercase hex txid, so anything of another shape -
    // wrong length, wrong case, not hex at all - can be a target no txid ever
    // beats, which would run the re-signing loop below to exhaustion before
    // failing. Refuse it before any key work.
    if (beatHash && !/^[0-9a-f]{64}$/.test(beatHash)) {
        throw new Error("invalid transaction ordering constraint")
    }
    const {tx, authoritative, fee, payments, outgoing, carriesTokens} = await analyzeSpend({
        raw, inputs, wallet, getOutput, findKey: keyFinder(wallet),
    })
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
        signed = tx.clone()
        // The BIP143 preimage never includes input scripts, so each input is
        // signed against the same unsigned transaction regardless of order.
        for (let i = 0; i < authoritative.length; i++) {
            const {output, key} = authoritative[i]
            const sighash = signed.hashForCashSignature(
                i, baddress.toOutputScript(output.address), output.value, SigHashType)
            signed.ins[i].script = bscript.compile([
                ScriptSignature(key.sign(sighash), SigHashType),
                key.getPublicKeyBuffer(),
            ])
        }
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
    PreviewSpend,
    SignTransaction,
    WalletAddresses: walletAddresses,
}
