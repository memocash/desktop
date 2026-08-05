const test = require("node:test");
const assert = require("node:assert");
const script = require("./script");
const OPS = require("bitcoincash-ops");
const lib = require("@bitcoin-dot-com/bitcoincashjs2-lib");

// The port's contract is byte-for-byte parity with the library it replaces,
// so most cases below assert the two implementations against each other
// rather than against hand-written expectations.

// Pushdata encoding changes shape at 76 (OP_PUSHDATA1), 256 (OP_PUSHDATA2)
// and 65536 (OP_PUSHDATA4); minimal-push kicks in for empty and one-byte
// data. Cover each boundary from both sides.
const dataSizes = [0, 1, 2, 20, 75, 76, 77, 255, 256, 257, 65535, 65536]

const chunkCases = () => {
    const cases = dataSizes.map(size => [OPS.OP_RETURN, Buffer.from("6d02", "hex"), Buffer.alloc(size, 0xab)])
    // one-byte buffers around the minimal-push special values
    for (const byte of [0x00, 0x01, 0x10, 0x11, 0x80, 0x81, 0x82, 0xff]) {
        cases.push([OPS.OP_RETURN, Buffer.from([byte])])
    }
    // opcode-only and mixed shapes
    cases.push([OPS.OP_DUP, OPS.OP_HASH160, Buffer.alloc(20, 0x11), OPS.OP_EQUALVERIFY, OPS.OP_CHECKSIG])
    cases.push([OPS.OP_HASH160, Buffer.alloc(20, 0x22), OPS.OP_EQUAL])
    cases.push([OPS.OP_0, OPS.OP_1, OPS.OP_16, OPS.OP_1NEGATE])
    cases.push([])
    return cases
}

test("compile matches the library on every boundary case", () => {
    for (const chunks of chunkCases()) {
        const ours = script.compile(chunks)
        const theirs = lib.script.compile(chunks)
        assert.equal(ours.toString("hex"), theirs.toString("hex"))
    }
})

test("compile passes through an already compiled buffer", () => {
    const buffer = Buffer.from("6a026d02", "hex")
    assert.equal(script.compile(buffer), buffer)
})

test("decompile matches the library and round-trips compile", () => {
    for (const chunks of chunkCases()) {
        const compiled = script.compile(chunks)
        const ours = script.decompile(compiled)
        const theirs = lib.script.decompile(compiled)
        assert.equal(ours.length, theirs.length)
        for (let i = 0; i < ours.length; i++) {
            if (Buffer.isBuffer(ours[i])) {
                assert.equal(ours[i].toString("hex"), theirs[i].toString("hex"))
            } else {
                assert.equal(ours[i], theirs[i])
            }
        }
        assert.equal(script.compile(ours).toString("hex"), compiled.toString("hex"))
    }
})

// A pushdata opcode cut off before its length bytes is not a script; the
// library answers [] and callers count on that. A length that merely
// overruns the data is different: the library shortens the slice and keeps
// going, so only parity is asserted there.
test("decompile of a truncated pushdata matches the library", () => {
    const missingLength = Buffer.from("4c", "hex") // OP_PUSHDATA1, no length byte
    assert.deepStrictEqual(script.decompile(missingLength), lib.script.decompile(missingLength))
    assert.deepStrictEqual(script.decompile(missingLength), [])
    const overrunLength = Buffer.from("4cff", "hex") // declares 255 bytes, has none
    assert.deepStrictEqual(script.decompile(overrunLength), lib.script.decompile(overrunLength))
})

test("toASM matches the library", () => {
    for (const chunks of chunkCases()) {
        const compiled = script.compile(chunks)
        assert.equal(script.toASM(compiled), lib.script.toASM(compiled))
    }
    // chunk-array input, not just buffers
    const chunks = [OPS.OP_RETURN, Buffer.from("6d01", "hex")]
    assert.equal(script.toASM(chunks), lib.script.toASM(chunks))
})

test("a memo post script compiles to the known bytes", () => {
    const compiled = script.compile([
        OPS.OP_RETURN,
        Buffer.from("6d02", "hex"),
        Buffer.from("hello", "utf8"),
    ])
    assert.equal(compiled.toString("hex"), "6a026d020568656c6c6f")
})
