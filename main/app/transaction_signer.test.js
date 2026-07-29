const test = require("node:test")
const assert = require("node:assert")
const bitcoin = require("@bitcoin-dot-com/bitcoincashjs2-lib")
const {mnemonicToSeedSync} = require("bip39")
const {BIP32Factory} = require("bip32")
const ecc = require("tiny-secp256k1")
const {MaxFeeRate, SignTransaction} = require("./transaction_signer")

const bip32 = BIP32Factory(ecc)
const key = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 7)})
const address = key.getAddress()
const prevHash = "11".repeat(32)
const slpPush = (buffer) => Buffer.concat([Buffer.from([buffer.length]), buffer])
const slpAmount = (amount) => Buffer.from(amount.toString(16).padStart(16, "0"), "hex")

const request = ({inputValue = 10000, outputValue = 9000} = {}) => {
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(bitcoin.address.toOutputScript(address), outputValue)
    return {
        raw: txb.__build(true).toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
        wallet: {keys: [key.toWIF()], addresses: [address]},
        getOutput: async () => ({
            hash: prevHash,
            index: 1,
            address,
            value: inputValue,
            script: bitcoin.address.toOutputScript(address).toString("hex"),
        }),
    }
}

test("signs using authoritative prevout metadata", async () => {
    const signed = await SignTransaction(request())
    const tx = bitcoin.Transaction.fromBuffer(Buffer.from(signed.raw, "hex"))
    assert.ok(tx.ins[0].script.length > 0)
    assert.equal(signed.fee, 1000)
    assert.equal(signed.txid, tx.getId())
    assert.deepEqual(signed.inputs, [{address, value: 10000}])
    assert.ok(signed.feeRate < MaxFeeRate)
})

test("derives a seed wallet change key only inside the signer", async () => {
    const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    const child = bip32.fromSeed(mnemonicToSeedSync(seed)).derivePath("m/44'/0'/0'/1/0")
    const changeAddress = bitcoin.ECPair.fromWIF(child.toWIF()).getAddress()
    const seeded = request()
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(changeAddress))
    txb.addOutput(bitcoin.address.toOutputScript(changeAddress), 9000)
    seeded.raw = txb.__build(true).toBuffer().toString("hex")
    seeded.wallet = {seed, addresses: [], changeList: [changeAddress], slpList: []}
    seeded.getOutput = async () => ({
        address: changeAddress,
        value: 10000,
        script: bitcoin.address.toOutputScript(changeAddress).toString("hex"),
    })
    assert.ok((await SignTransaction(seeded)).raw)
})

test("refuses input metadata that does not match the raw transaction", async () => {
    const changedHash = request()
    changedHash.inputs[0].prev_hash = "22".repeat(32)
    await assert.rejects(SignTransaction(changedHash), {message: /does not match transaction/})

    const changedIndex = request()
    changedIndex.inputs[0].prev_index = 2
    await assert.rejects(SignTransaction(changedIndex), {message: /does not match transaction/})
})

test("refuses a prevout not established by the local database", async () => {
    await assert.rejects(SignTransaction({...request(), getOutput: async () => undefined}),
        {message: /not in the local database/})
})

test("refuses duplicate inputs", async () => {
    const tx = new bitcoin.Transaction()
    for (let i = 0; i < 2; i++) {
        tx.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    }
    tx.addOutput(bitcoin.address.toOutputScript(address), 18000)
    const duplicate = request()
    duplicate.raw = tx.toBuffer().toString("hex")
    duplicate.inputs = [
        {prev_hash: prevHash, prev_index: 1},
        {prev_hash: prevHash, prev_index: 1},
    ]
    await assert.rejects(SignTransaction(duplicate), {message: /duplicate input/})
})

test("refuses authoritative inputs outside the wallet", async () => {
    const other = bitcoin.ECPair.makeRandom({rng: () => Buffer.alloc(32, 9)}).getAddress()
    const malicious = request()
    malicious.getOutput = async () => ({address: other, value: 10000})
    await assert.rejects(SignTransaction(malicious), {message: /does not belong/})
})

test("refuses a database script that disagrees with its address", async () => {
    const malicious = request()
    malicious.getOutput = async () => ({
        address,
        value: 10000,
        script: bitcoin.script.compile([bitcoin.opcodes.OP_TRUE]).toString("hex"),
    })
    await assert.rejects(SignTransaction(malicious), {message: /script does not match/})
})

test("refuses burning a token input in a non-SLP transaction", async () => {
    const burn = request()
    burn.getOutput = async () => ({
        address,
        value: 10000,
        script: bitcoin.address.toOutputScript(address).toString("hex"),
        slp_token_hash: "aa".repeat(32),
        slp_amount: "100",
    })
    await assert.rejects(SignTransaction(burn), {message: /valid SLP transaction/})
})

test("signs an SLP SEND only when it preserves the authoritative token amount", async () => {
    const tokenHash = "aa".repeat(32)
    const sendScript = Buffer.concat([
        Buffer.from([bitcoin.opcodes.OP_RETURN]),
        slpPush(Buffer.from("534c5000", "hex")),
        slpPush(Buffer.from([1])),
        slpPush(Buffer.from("SEND")),
        slpPush(Buffer.from(tokenHash, "hex")),
        slpPush(slpAmount(60n)),
        slpPush(slpAmount(40n)),
    ])
    const txb = new bitcoin.TransactionBuilder()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1,
        bitcoin.Transaction.DEFAULT_SEQUENCE, bitcoin.address.toOutputScript(address))
    txb.addOutput(sendScript, 0)
    txb.addOutput(bitcoin.address.toOutputScript(address), 546)
    txb.addOutput(bitcoin.address.toOutputScript(address), 546)
    const send = request()
    send.raw = txb.__build(true).toBuffer().toString("hex")
    send.getOutput = async () => ({
        address,
        value: 2000,
        script: bitcoin.address.toOutputScript(address).toString("hex"),
        slp_token_hash: tokenHash,
        slp_amount: "100",
    })
    assert.ok((await SignTransaction(send)).raw)

    const burn = {...send}
    burn.getOutput = async () => ({...(await send.getOutput()), slp_amount: "101"})
    await assert.rejects(SignTransaction(burn), {message: /does not preserve/})
})

test("refuses negative fees and excessive fee rates", async () => {
    await assert.rejects(SignTransaction(request({inputValue: 8000, outputValue: 9000})),
        {message: /spends more than its inputs/})
    await assert.rejects(SignTransaction(request({inputValue: 1000000, outputValue: 0})),
        {message: /fee rate exceeds safety limit/})
})

test("refuses watch-only wallets", async () => {
    await assert.rejects(SignTransaction({...request(), wallet: {addresses: [address]}}),
        {message: /watch-only/})
})
