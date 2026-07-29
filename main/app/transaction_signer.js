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

const bip32 = BIP32Factory(ecc)
const MaxFeeRate = 100
const MaxBeatHashAttempts = 4096
const DustLimit = 546

const walletAddresses = (wallet) =>
    (wallet.addresses || []).concat(wallet.changeList || [], wallet.slpList || [])

const keyForAddress = (wallet, address) => {
    for (const wif of wallet.keys || []) {
        const key = bitcoin.ECPair.fromWIF(wif)
        if (key.getAddress() === address) {
            return key
        }
    }
    if (!wallet.seed) {
        return undefined
    }
    const node = bip32.fromSeed(mnemonicToSeedSync(wallet.seed))
    const lists = [
        {addresses: wallet.addresses || [], path: "m/44'/0'/0'/0/"},
        {addresses: wallet.changeList || [], path: "m/44'/0'/0'/1/"},
        {addresses: wallet.slpList || [], path: "m/44'/245'/0'/0/"},
    ]
    for (const {addresses, path} of lists) {
        const index = addresses.indexOf(address)
        if (index !== -1) {
            return bitcoin.ECPair.fromWIF(node.derivePath(path + index).toWIF())
        }
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

const validateSlp = (tx, authoritative) => {
    const tokenInputs = authoritative.filter(({output}) => output.slp_token_hash)
    const batonInputs = authoritative.filter(({output}) => output.slp_baton_token_hash)
    if (!tokenInputs.length && !batonInputs.length) {
        return
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
        return
    }
    if (action === "MINT") {
        if (tokenInputs.length || !batonInputs.length || !Buffer.isBuffer(chunks[4])) {
            throw new Error("invalid SLP MINT")
        }
        const tokenHash = chunks[4].toString("hex")
        if (batonInputs.some(({output}) => output.slp_baton_token_hash !== tokenHash)) {
            throw new Error("SLP MINT baton does not match its token")
        }
        return
    }
    throw new Error("unsupported SLP action for token inputs")
}

const SignTransaction = async ({raw, inputs, beatHash, wallet, getOutput}) => {
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
        const key = keyForAddress(wallet, output.address)
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
    validateSlp(tx, authoritative)

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
        inputs: authoritative.map(({output}) => ({
            address: output.address,
            value: output.value,
        })),
    }
}

module.exports = {
    MaxFeeRate,
    SignTransaction,
}
