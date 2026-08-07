const test = require("node:test");
const assert = require("node:assert");
const script = require("./script");
const golden = require("./golden.json");

// golden.json holds the replaced library's own outputs, captured before its
// removal, across every pushdata encoding boundary (76/256/65536 from both
// sides), the minimal-push special values, standard templates, and
// opcode-only scripts. The port's contract is matching them byte for byte.

const toChunks = (encoded) => encoded.map(c => c.op !== undefined ? c.op : Buffer.from(c.data, "hex"))

test("compile matches the library's captured output on every boundary case", () => {
    for (const {chunks, compiled} of golden.script) {
        assert.equal(script.compile(toChunks(chunks)).toString("hex"), compiled)
    }
})

test("compile passes through an already compiled buffer", () => {
    const buffer = Buffer.from("6a026d02", "hex")
    assert.equal(script.compile(buffer), buffer)
})

test("decompile round-trips every compiled case", () => {
    for (const {compiled} of golden.script) {
        const chunks = script.decompile(Buffer.from(compiled, "hex"))
        assert.equal(script.compile(chunks).toString("hex"), compiled)
    }
})

// A pushdata opcode cut off before its length bytes is not a script; the
// library answered [] and callers rely on that. A length that merely
// overruns the data is different: the slice shortens and decompilation
// continues, minimally re-encoding what remains.
test("truncated pushdata behavior is preserved", () => {
    assert.deepStrictEqual(script.decompile(Buffer.from("4c", "hex")), [])
    const overrun = script.decompile(Buffer.from("4cff", "hex"))
    assert.equal(script.compile(overrun).toString("hex"), "00")
})

test("toASM matches the library's captured output", () => {
    for (const {chunks, compiled, asm} of golden.script) {
        assert.equal(script.toASM(Buffer.from(compiled, "hex")), asm)
        assert.equal(script.toASM(toChunks(chunks)), asm)
    }
})

test("a memo post script compiles to the known bytes", () => {
    const compiled = script.compile([
        0x6a,
        Buffer.from("6d02", "hex"),
        Buffer.from("hello", "utf8"),
    ])
    assert.equal(compiled.toString("hex"), "6a026d020568656c6c6f")
})
