const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const {ECPair, ScriptSignature} = require("./ecpair");
const lib = require("@bitcoin-dot-com/bitcoincashjs2-lib");

// Deterministic keys: scalars from tagged sha256, WIF-encoded by the library
// so the fixtures are its own output.
const scalar = (tag) => crypto.createHash("sha256").update("desktop2 ecpair " + tag).digest()
const BigInteger = require("bigi")
const LibECPair = require("@bitcoin-dot-com/bitcoincashjs2-lib/src/ecpair")
const libKey = (tag, compressed) =>
    new LibECPair(BigInteger.fromBuffer(scalar(tag)), null, {compressed: compressed})

test("fromWIF and getAddress match the library for both compressions", () => {
    for (const tag of ["a", "b", "c"]) {
        for (const compressed of [true, false]) {
            const wif = libKey(tag, compressed).toWIF()
            const ours = ECPair.fromWIF(wif)
            const theirs = lib.ECPair.fromWIF(wif)
            assert.equal(ours.getAddress(), theirs.getAddress())
            assert.equal(ours.toWIF(), wif)
            assert.equal(
                ours.getPublicKeyBuffer().toString("hex"),
                theirs.getPublicKeyBuffer().toString("hex"),
            )
        }
    }
})

test("fromPublicKeyBuffer matches the library", () => {
    for (const compressed of [true, false]) {
        const pub = libKey("pub", compressed).getPublicKeyBuffer()
        assert.equal(
            ECPair.fromPublicKeyBuffer(pub).getAddress(),
            lib.ECPair.fromPublicKeyBuffer(pub).getAddress(),
        )
    }
    assert.throws(() => ECPair.fromPublicKeyBuffer(Buffer.alloc(33)))
})

test("invalid WIFs are rejected as the library rejects them", () => {
    const good = libKey("a", true).toWIF()
    const badChecksum = good.slice(0, -1) + (good.endsWith("1") ? "2" : "1")
    const bs58check = require("bs58check")
    const wrongVersion = bs58check.encode(Buffer.concat(
        [Buffer.from([0xef]), scalar("a"), Buffer.from([0x01])]))
    // 31 key bytes and no flag: unlike a 33-byte payload - which reads as a
    // legitimate uncompressed WIF - no reading of this length is valid.
    const wrongLength = bs58check.encode(Buffer.concat(
        [Buffer.from([0x80]), scalar("a").slice(0, 31)]))
    const zeroKey = bs58check.encode(Buffer.concat(
        [Buffer.from([0x80]), Buffer.alloc(32), Buffer.from([0x01])]))
    for (const bad of [badChecksum, wrongVersion, wrongLength, zeroKey, "", "not a wif"]) {
        assert.throws(() => ECPair.fromWIF(bad), undefined, "ours accepts: " + bad)
        assert.throws(() => lib.ECPair.fromWIF(bad), undefined, "lib accepts: " + bad)
    }
})

// The signatures themselves are byte-identical - both sign plain RFC6979
// with low-S - so the full scriptSig payload can be compared, DER quirks
// (stripped and restored leading zeros) included.
test("script signatures are byte-identical to the library's", () => {
    const hashType = 0x41
    for (const tag of ["a", "b", "c"]) {
        const wif = libKey(tag, true).toWIF()
        const ours = ECPair.fromWIF(wif)
        const theirs = lib.ECPair.fromWIF(wif)
        for (let i = 0; i < 32; i++) {
            const hash = crypto.createHash("sha256").update("sighash " + i).digest()
            const mine = ScriptSignature(ours.sign(hash), hashType)
            const libSig = theirs.sign(hash).toScriptSignature(hashType)
            assert.equal(mine.toString("hex"), libSig.toString("hex"))
        }
    }
})
