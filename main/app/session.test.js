const test = require("node:test")
const assert = require("node:assert")
const {KeyBytes, Open, Seal} = require("./session")

test("a sealed password comes back only with the key that sealed it", () => {
    const {key, envelope} = Seal("correct horse battery staple")
    assert.equal(Open(envelope, key), "correct horse battery staple")
    assert.equal(Buffer.from(key, "base64").length, KeyBytes)
})

test("neither half is usable on its own", () => {
    const {key, envelope} = Seal("hunter2")
    const other = Seal("hunter2")
    // The ciphertext main holds says nothing without the key.
    assert.equal(JSON.stringify(envelope).includes("hunter2"), false)
    // A key from another session doesn't open this envelope.
    assert.equal(Open(envelope, other.key), undefined)
    // Nor does a key of the wrong shape, or none at all.
    assert.equal(Open(envelope, "not-base64-of-32-bytes"), undefined)
    assert.equal(Open(envelope, undefined), undefined)
    assert.equal(Open(undefined, key), undefined)
})

test("a tampered envelope opens as nothing rather than as junk", () => {
    const {key, envelope} = Seal("hunter2")
    const flip = (value) => {
        const bytes = Buffer.from(value, "base64")
        bytes[0] ^= 0xff
        return bytes.toString("base64")
    }
    assert.equal(Open({...envelope, data: flip(envelope.data)}, key), undefined)
    assert.equal(Open({...envelope, tag: flip(envelope.tag)}, key), undefined)
    assert.equal(Open({...envelope, iv: flip(envelope.iv)}, key), undefined)
})

test("every session gets its own key and nonce", () => {
    const first = Seal("hunter2")
    const second = Seal("hunter2")
    assert.notEqual(first.key, second.key)
    assert.notEqual(first.envelope.iv, second.envelope.iv)
    assert.notEqual(first.envelope.data, second.envelope.data)
})
