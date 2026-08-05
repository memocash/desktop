const test = require("node:test");
const assert = require("node:assert");
const address = require("./address");
const networks = require("./networks");
const lib = require("@bitcoin-dot-com/bitcoincashjs2-lib");

// Parity with the library on every input the app can produce; hand-checked
// values only where the library is the thing under suspicion.

const p2pkhAddress = "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH" // hash160 of ones
const p2shAddress = "342ftSRCvFHfCeFFBuz4xwbeqnDw6BGUey"

test("fromBase58Check matches the library", () => {
    for (const addr of [p2pkhAddress, p2shAddress]) {
        const ours = address.fromBase58Check(addr)
        const theirs = lib.address.fromBase58Check(addr)
        assert.equal(ours.version, theirs.version)
        assert.equal(ours.hash.toString("hex"), theirs.hash.toString("hex"))
    }
})

test("fromBase58Check rejects what the library rejects", () => {
    for (const bad of ["", "notanaddress", "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMI", // bad checksum
        "111111111111111111112xT3V1e", // 20-byte payload, too short
    ]) {
        assert.throws(() => address.fromBase58Check(bad))
        assert.throws(() => lib.address.fromBase58Check(bad))
    }
})

test("toBase58Check matches the library and round-trips", () => {
    const hash = Buffer.alloc(20, 0x5a)
    for (const version of [networks.bitcoin.pubKeyHash, networks.bitcoin.scriptHash, 0x6f]) {
        const ours = address.toBase58Check(hash, version)
        assert.equal(ours, lib.address.toBase58Check(hash, version))
        const decoded = address.fromBase58Check(ours)
        assert.equal(decoded.version, version)
        assert.equal(decoded.hash.toString("hex"), hash.toString("hex"))
    }
})

test("toBase58Check rejects a hash that is not 20 bytes", () => {
    assert.throws(() => address.toBase58Check(Buffer.alloc(19), 0))
    assert.throws(() => address.toBase58Check(Buffer.alloc(21), 0))
    assert.throws(() => lib.address.toBase58Check(Buffer.alloc(19), 0))
})

test("toOutputScript matches the library for both address kinds", () => {
    for (const addr of [p2pkhAddress, p2shAddress]) {
        assert.equal(
            address.toOutputScript(addr).toString("hex"),
            lib.address.toOutputScript(addr).toString("hex"),
        )
    }
})

test("toOutputScript rejects what the library rejects", () => {
    for (const bad of ["", "notanaddress", "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMI"]) {
        assert.throws(() => address.toOutputScript(bad))
        assert.throws(() => lib.address.toOutputScript(bad))
    }
})

test("fromOutputScript matches the library and round-trips", () => {
    for (const addr of [p2pkhAddress, p2shAddress]) {
        const outputScript = address.toOutputScript(addr)
        assert.equal(address.fromOutputScript(outputScript), addr)
        assert.equal(address.fromOutputScript(outputScript), lib.address.fromOutputScript(outputScript))
    }
})

test("fromOutputScript rejects non-payment scripts", () => {
    const opReturn = Buffer.from("6a026d02", "hex")
    assert.throws(() => address.fromOutputScript(opReturn))
    assert.throws(() => lib.address.fromOutputScript(opReturn))
})
