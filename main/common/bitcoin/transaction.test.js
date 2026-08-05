const test = require("node:test");
const assert = require("node:assert");
const {Transaction} = require("./transaction");
const {ECPair, ScriptSignature} = require("./ecpair");
const address = require("./address");
const script = require("./script");
const golden = require("./golden.json");

// golden.json holds the replaced library's own outputs for a representative
// spend - two P2PKH inputs under different keys, an OP_RETURN memo output, a
// payment, and change - captured before its removal: the unsigned bytes, the
// per-input BIP143 cash sighashes, and the fully signed transaction at three
// locktimes mirroring the beat-hash retry loop.

const hashType = Transaction.SIGHASH_ALL | Transaction.SIGHASH_BITCOINCASHBIP143
const unsignedRaw = () => Buffer.from(golden.transaction.unsigned, "hex")

test("fromBuffer round-trips the captured unsigned transaction", () => {
    const tx = Transaction.fromBuffer(unsignedRaw())
    assert.equal(tx.toBuffer().toString("hex"), golden.transaction.unsigned)
    assert.equal(tx.getId(), golden.transaction.unsignedId)
    assert.equal(tx.byteLength(), unsignedRaw().length)
    assert.equal(tx.ins.length, golden.transaction.inputs.length)
})

test("trailing bytes are rejected", () => {
    assert.throws(() => Transaction.fromBuffer(
        Buffer.concat([unsignedRaw(), Buffer.from([0x00])])))
})

test("a witness serialization is refused", () => {
    // version 1, segwit marker+flag, no inputs
    assert.throws(() => Transaction.fromBuffer(Buffer.from("010000000001", "hex")))
})

// No version copying here: a fresh internal transaction must default to the
// version the library stamped on everything this app ever assembled, or
// every newly built transaction gets different bytes and a different txid.
test("fresh assembly reproduces the captured unsigned bytes", () => {
    const parsed = Transaction.fromBuffer(unsignedRaw())
    const tx = new Transaction()
    assert.equal(tx.version, golden.transaction.defaultVersion)
    for (const input of parsed.ins) {
        tx.addInput(Buffer.from(input.hash), input.index)
    }
    for (const output of parsed.outs) {
        tx.addOutput(Buffer.from(output.script), output.value)
    }
    assert.equal(tx.toHex(), golden.transaction.unsigned)
    assert.equal(tx.getId(), golden.transaction.unsignedId)
})

test("the cash sighash reproduces the captured value for every input", () => {
    const tx = Transaction.fromBuffer(unsignedRaw())
    for (let i = 0; i < golden.transaction.inputs.length; i++) {
        const input = golden.transaction.inputs[i]
        const prevOutScript = address.toOutputScript(ECPair.fromWIF(input.wif).getAddress())
        assert.equal(
            tx.hashForCashSignature(i, prevOutScript, input.value, hashType).toString("hex"),
            golden.transaction.sighash[i],
        )
    }
})

test("legacy sighash without the forkid bit is refused", () => {
    const tx = Transaction.fromBuffer(unsignedRaw())
    const input = golden.transaction.inputs[0]
    const prevOutScript = address.toOutputScript(ECPair.fromWIF(input.wif).getAddress())
    assert.throws(() => tx.hashForCashSignature(0, prevOutScript, input.value, Transaction.SIGHASH_ALL))
})

// The end-to-end check: signing every input the way the signer does
// reproduces the library's captured transactions byte for byte, across the
// locktime bumps the beat-hash loop performs.
test("a fully signed transaction reproduces the captured bytes", () => {
    for (const fixture of golden.transaction.signed) {
        const tx = Transaction.fromBuffer(unsignedRaw())
        tx.locktime = fixture.locktime
        for (let i = 0; i < golden.transaction.inputs.length; i++) {
            const input = golden.transaction.inputs[i]
            const key = ECPair.fromWIF(input.wif)
            const prevOutScript = address.toOutputScript(key.getAddress())
            const sighash = tx.hashForCashSignature(i, prevOutScript, input.value, hashType)
            tx.ins[i].script = script.compile([
                ScriptSignature(key.sign(sighash), hashType),
                key.getPublicKeyBuffer(),
            ])
        }
        assert.equal(tx.toHex(), fixture.hex)
        assert.equal(tx.getId(), fixture.txid)
    }
})
