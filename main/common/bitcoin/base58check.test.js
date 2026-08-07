const test = require("node:test");
const assert = require("node:assert");
const {decode, encode} = require("./base58check");
const golden = require("./golden.json");

// Two well-known mainnet vectors, checkable against any block explorer: the
// all-zeros P2PKH burn address, and Satoshi's genesis-block address.
test("known vectors encode and decode", () => {
    assert.equal(encode(Buffer.alloc(21)), "1111111111111111111114oLvT2")
    assert.deepEqual(decode("1111111111111111111114oLvT2"), Buffer.alloc(21))
    const genesis = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
    assert.equal(encode(decode(genesis)), genesis)
    assert.equal(decode(genesis)[0], 0x00)
})

// The fixtures were captured from the replaced library, whose codec was
// bs58check itself - so agreeing with them byte for byte is agreeing with
// the package this module replaces, on every string the app produces.
test("golden WIFs and addresses round-trip through the internal codec", () => {
    for (const fixture of golden.ecpair.keys) {
        assert.equal(encode(decode(fixture.wif)), fixture.wif)
        assert.equal(encode(decode(fixture.address)), fixture.address)
    }
})

test("payloads round-trip, including zero-heavy ones", () => {
    for (const payload of [
        Buffer.alloc(0),
        Buffer.from([0x00]),
        Buffer.from([0x00, 0x00, 0x00, 0xff]),
        Buffer.from([0x80]),
        Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
        Buffer.alloc(33, 0xff),
    ]) {
        assert.deepEqual(decode(encode(payload)), payload)
    }
})

test("a corrupted character fails the checksum", () => {
    const good = golden.ecpair.keys[0].address
    const flipped = good.slice(0, -1) + (good.endsWith("1") ? "2" : "1")
    assert.throws(() => decode(flipped), {message: "Invalid checksum"})
})

test("junk is refused", () => {
    for (const bad of ["", "1", "111", "1111", "0", "O", "I", "l", "not base58!", "zzzz zzzz"]) {
        assert.throws(() => decode(bad), undefined, "decode accepts: " + JSON.stringify(bad))
    }
    assert.throws(() => decode(undefined), TypeError)
})
