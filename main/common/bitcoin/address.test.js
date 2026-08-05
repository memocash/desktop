const test = require("node:test");
const assert = require("node:assert");
const address = require("./address");
const golden = require("./golden.json");

// golden.json holds the replaced library's own codec outputs, captured
// before its removal, for both address kinds and both directions.

test("fromBase58Check and toOutputScript match the captured outputs", () => {
    for (const fixture of golden.address.decode) {
        const decoded = address.fromBase58Check(fixture.address)
        assert.equal(decoded.version, fixture.version)
        assert.equal(decoded.hash.toString("hex"), fixture.hash)
        assert.equal(address.toOutputScript(fixture.address).toString("hex"), fixture.outputScript)
    }
})

test("fromOutputScript round-trips the captured scripts", () => {
    for (const fixture of golden.address.decode) {
        assert.equal(address.fromOutputScript(Buffer.from(fixture.outputScript, "hex")), fixture.address)
    }
})

test("toBase58Check matches the captured outputs and round-trips", () => {
    for (const fixture of golden.address.encode) {
        const encoded = address.toBase58Check(Buffer.from(fixture.hash, "hex"), fixture.version)
        assert.equal(encoded, fixture.address)
        const decoded = address.fromBase58Check(encoded)
        assert.equal(decoded.version, fixture.version)
        assert.equal(decoded.hash.toString("hex"), fixture.hash)
    }
})

test("invalid base58check input is rejected", () => {
    for (const bad of ["", "notanaddress", "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMI", // bad checksum
        "111111111111111111112xT3V1e", // 20-byte payload, too short
    ]) {
        assert.throws(() => address.fromBase58Check(bad))
        assert.throws(() => address.toOutputScript(bad))
    }
})

test("toBase58Check rejects a hash that is not 20 bytes", () => {
    assert.throws(() => address.toBase58Check(Buffer.alloc(19), 0))
    assert.throws(() => address.toBase58Check(Buffer.alloc(21), 0))
})

test("fromOutputScript rejects non-payment scripts", () => {
    assert.throws(() => address.fromOutputScript(Buffer.from("6a026d02", "hex")))
})
