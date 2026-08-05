const test = require("node:test");
const assert = require("node:assert");
const bs58check = require("bs58check");
const {ECPair, ScriptSignature} = require("./ecpair");
const {DecodeWif, IsValidWif} = require("./wif");
const golden = require("./golden.json");

// golden.json holds the replaced library's own outputs for deterministic
// keys, captured before its removal: WIFs, addresses, public keys, and 96
// script signatures. Both implementations sign plain RFC6979 with low-S, so
// the signatures were byte-identical when captured live - these fixtures
// keep that equivalence pinned.

test("fromWIF reproduces the captured addresses and public keys", () => {
    for (const fixture of golden.ecpair.keys) {
        const key = ECPair.fromWIF(fixture.wif)
        assert.equal(key.getAddress(), fixture.address)
        assert.equal(key.getPublicKeyBuffer().toString("hex"), fixture.pubkey)
        assert.equal(key.toWIF(), fixture.wif)
        assert.equal(key.compressed, fixture.compressed)
    }
})

test("fromPublicKeyBuffer reproduces the captured addresses", () => {
    for (const fixture of golden.ecpair.publicOnly) {
        assert.equal(
            ECPair.fromPublicKeyBuffer(Buffer.from(fixture.pubkey, "hex")).getAddress(),
            fixture.address,
        )
    }
    assert.throws(() => ECPair.fromPublicKeyBuffer(Buffer.alloc(33)))
})

test("invalid WIFs are rejected", () => {
    const good = golden.ecpair.keys[0].wif
    const scalar = Buffer.from(
        bs58check.decode(good).slice(1, 33))
    const badChecksum = good.slice(0, -1) + (good.endsWith("1") ? "2" : "1")
    const wrongVersion = bs58check.encode(Buffer.concat(
        [Buffer.from([0xef]), scalar, Buffer.from([0x01])]))
    // 31 key bytes and no flag: unlike a 33-byte payload - which reads as a
    // legitimate uncompressed WIF - no reading of this length is valid.
    const wrongLength = bs58check.encode(Buffer.concat(
        [Buffer.from([0x80]), scalar.slice(0, 31)]))
    const zeroKey = bs58check.encode(Buffer.concat(
        [Buffer.from([0x80]), Buffer.alloc(32), Buffer.from([0x01])]))
    const badFlag = bs58check.encode(Buffer.concat(
        [Buffer.from([0x80]), scalar, Buffer.from([0x02])]))
    for (const bad of [badChecksum, wrongVersion, wrongLength, zeroKey, badFlag, "", "not a wif"]) {
        assert.throws(() => ECPair.fromWIF(bad), undefined, "fromWIF accepts: " + bad)
        assert.equal(IsValidWif(bad), false, "IsValidWif accepts: " + bad)
    }
})

// The renderer's import screen uses the structure check alone; it has to
// agree with what fromWIF will accept in main, or a pasted key would pass
// the screen and fail the wallet.
test("IsValidWif and DecodeWif agree with fromWIF on the captured keys", () => {
    for (const fixture of golden.ecpair.keys) {
        assert.equal(IsValidWif(fixture.wif), true)
        const decoded = DecodeWif(fixture.wif)
        assert.equal(decoded.compressed, fixture.compressed)
        assert.equal(decoded.privateKey.length, 32)
    }
    assert.equal(IsValidWif(undefined), false)
    assert.equal(IsValidWif(""), false)
})

test("script signatures reproduce the captured bytes", () => {
    for (const fixture of golden.ecpair.signatures) {
        const key = ECPair.fromWIF(fixture.wif)
        const signature = ScriptSignature(key.sign(Buffer.from(fixture.hash, "hex")), 0x41)
        assert.equal(signature.toString("hex"), fixture.scriptSig)
    }
})
