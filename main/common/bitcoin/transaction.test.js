const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const {Transaction} = require("./transaction");
const {ECPair, ScriptSignature} = require("./ecpair");
const address = require("./address");
const script = require("./script");
const OPS = require("bitcoincash-ops");
const lib = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const BigInteger = require("bigi")
const LibECPair = require("@bitcoin-dot-com/bitcoincashjs2-lib/src/ecpair")
const scalar = (tag) => crypto.createHash("sha256").update("desktop2 tx " + tag).digest()
const wifFor = (tag) => new LibECPair(BigInteger.fromBuffer(scalar(tag)), null, {compressed: true}).toWIF()

// A representative spend: two P2PKH inputs under different keys, an OP_RETURN
// memo output, a payment, and change - the exact shape the signer handles.
const buildUnsigned = () => {
    const keyA = lib.ECPair.fromWIF(wifFor("a"))
    const keyB = lib.ECPair.fromWIF(wifFor("b"))
    const txb = new lib.TransactionBuilder()
    txb.addInput(crypto.createHash("sha256").update("prev 0").digest(), 1,
        lib.Transaction.DEFAULT_SEQUENCE, lib.address.toOutputScript(keyA.getAddress()))
    txb.addInput(crypto.createHash("sha256").update("prev 1").digest(), 0,
        lib.Transaction.DEFAULT_SEQUENCE, lib.address.toOutputScript(keyB.getAddress()))
    txb.addOutput(lib.script.compile([
        OPS.OP_RETURN, Buffer.from("6d02", "hex"), Buffer.from("parity", "utf8"),
    ]), 0)
    txb.addOutput(lib.address.toOutputScript(keyB.getAddress()), 1000)
    txb.addOutput(lib.address.toOutputScript(keyA.getAddress()), 2500)
    return {
        raw: txb.__build(true).toBuffer(),
        inputs: [
            {key: keyA, wif: wifFor("a"), value: 2000},
            {key: keyB, wif: wifFor("b"), value: 2000},
        ],
    }
}

test("fromBuffer matches the library field for field and round-trips", () => {
    const {raw} = buildUnsigned()
    const ours = Transaction.fromBuffer(raw)
    const theirs = lib.Transaction.fromBuffer(raw)
    assert.equal(ours.version, theirs.version)
    assert.equal(ours.locktime, theirs.locktime)
    assert.equal(ours.ins.length, theirs.ins.length)
    for (let i = 0; i < ours.ins.length; i++) {
        assert.equal(ours.ins[i].hash.toString("hex"), theirs.ins[i].hash.toString("hex"))
        assert.equal(ours.ins[i].index, theirs.ins[i].index)
        assert.equal(ours.ins[i].sequence, theirs.ins[i].sequence)
        assert.equal(ours.ins[i].script.toString("hex"), theirs.ins[i].script.toString("hex"))
    }
    assert.equal(ours.outs.length, theirs.outs.length)
    for (let i = 0; i < ours.outs.length; i++) {
        assert.equal(ours.outs[i].value, theirs.outs[i].value)
        assert.equal(ours.outs[i].script.toString("hex"), theirs.outs[i].script.toString("hex"))
    }
    assert.equal(ours.toBuffer().toString("hex"), raw.toString("hex"))
    assert.equal(ours.getId(), theirs.getId())
    assert.equal(ours.byteLength(), raw.length)
})

test("trailing bytes are rejected as the library rejects them", () => {
    const {raw} = buildUnsigned()
    const padded = Buffer.concat([raw, Buffer.from([0x00])])
    assert.throws(() => Transaction.fromBuffer(padded))
    assert.throws(() => lib.Transaction.fromBuffer(padded))
})

test("a witness serialization is refused", () => {
    // version 1, segwit marker+flag, no inputs
    const witness = Buffer.from("010000000001", "hex")
    assert.throws(() => Transaction.fromBuffer(witness))
})

// No version copying here: a fresh internal transaction must default to the
// same version as a fresh library transaction, or everything assembled
// through this module gets different bytes and a different txid.
test("addInput and addOutput assemble the same unsigned bytes as the builder", () => {
    const {raw} = buildUnsigned()
    const theirs = lib.Transaction.fromBuffer(raw)
    const ours = new Transaction()
    assert.equal(ours.version, new lib.Transaction().version)
    for (const input of theirs.ins) {
        ours.addInput(Buffer.from(input.hash), input.index)
    }
    for (const output of theirs.outs) {
        ours.addOutput(Buffer.from(output.script), output.value)
    }
    assert.equal(ours.toHex(), raw.toString("hex"))
    assert.equal(ours.getId(), theirs.getId())
})

test("the cash sighash matches the library for every input", () => {
    const {raw, inputs} = buildUnsigned()
    const ours = Transaction.fromBuffer(raw)
    const theirs = lib.Transaction.fromBuffer(raw)
    const hashType = Transaction.SIGHASH_ALL | Transaction.SIGHASH_BITCOINCASHBIP143
    for (let i = 0; i < inputs.length; i++) {
        const prevOutScript = address.toOutputScript(inputs[i].key.getAddress())
        assert.equal(
            ours.hashForCashSignature(i, prevOutScript, inputs[i].value, hashType).toString("hex"),
            theirs.hashForCashSignature(i, prevOutScript, inputs[i].value, hashType).toString("hex"),
        )
    }
})

test("legacy sighash without the forkid bit is refused", () => {
    const {raw, inputs} = buildUnsigned()
    const ours = Transaction.fromBuffer(raw)
    const prevOutScript = address.toOutputScript(inputs[0].key.getAddress())
    assert.throws(() => ours.hashForCashSignature(0, prevOutScript, inputs[0].value, Transaction.SIGHASH_ALL))
})

// The end-to-end check: signing every input the way the signer will produces
// the byte-identical transaction the library's builder produces today,
// including across the locktime bumps the beat-hash loop performs.
test("a fully signed transaction is byte-identical to the library's", () => {
    const {raw, inputs} = buildUnsigned()
    const hashType = Transaction.SIGHASH_ALL | Transaction.SIGHASH_BITCOINCASHBIP143
    for (const locktime of [0, 500000000, 500000005]) {
        const theirsUnsigned = lib.Transaction.fromBuffer(raw)
        theirsUnsigned.locktime = locktime
        const txb = lib.TransactionBuilder.fromTransaction(theirsUnsigned)
        for (let i = 0; i < inputs.length; i++) {
            txb.sign(i, lib.ECPair.fromWIF(inputs[i].wif), undefined,
                lib.Transaction.SIGHASH_ALL, inputs[i].value)
        }
        const theirs = txb.build()

        const ours = Transaction.fromBuffer(raw)
        ours.locktime = locktime
        for (let i = 0; i < inputs.length; i++) {
            const key = ECPair.fromWIF(inputs[i].wif)
            const prevOutScript = address.toOutputScript(key.getAddress())
            const sighash = ours.hashForCashSignature(i, prevOutScript, inputs[i].value, hashType)
            ours.ins[i].script = script.compile([
                ScriptSignature(key.sign(sighash), hashType),
                key.getPublicKeyBuffer(),
            ])
        }
        assert.equal(ours.toHex(), theirs.toBuffer().toString("hex"))
        assert.equal(ours.getId(), theirs.getId())
    }
})
