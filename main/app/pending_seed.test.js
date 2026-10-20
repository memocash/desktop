const test = require("node:test")
const assert = require("node:assert")
const {validateMnemonic} = require("bip39")
const {Discard, Generate, Import, Retype, Use} = require("./pending_seed")

const Window = 1
const OtherWindow = 2

test("a generated seed is a valid mnemonic and only usable once retyped", () => {
    const words = Generate(Window)
    assert.equal(validateMnemonic(words), true)
    // A wallet must not be creatable before the person proves they stored the
    // words, and a wrong phrase is not that proof.
    assert.throws(() => Use(Window), /no retyped seed/)
    assert.equal(Retype(Window, "abandon abandon about"), false)
    assert.throws(() => Use(Window), /no retyped seed/)
    assert.equal(Retype(Window, words), true)
    assert.equal(Use(Window), words)
    // Left in place until discarded, so a create refused for its name can be
    // retried without redoing the whole seed flow.
    assert.equal(Use(Window), words)
    Discard(Window)
    assert.throws(() => Use(Window), /no retyped seed/)
})

test("retyping forgives spacing but not wording", () => {
    const words = Generate(Window)
    assert.equal(Retype(Window, "  " + words.split(" ").join("   ") + "\n"), true)
    assert.equal(Use(Window), words)
    Discard(Window)
})

test("an imported seed is validated, normalized, and arrives retyped", () => {
    const phrase = "abandon abandon abandon abandon abandon abandon " +
        "abandon abandon abandon abandon abandon about"
    assert.equal(Import(Window, "not a mnemonic"), false)
    assert.throws(() => Use(Window), /no retyped seed/)
    assert.equal(Import(Window, "  " + phrase.split(" ").join("  ") + "  "), true)
    assert.equal(Use(Window), phrase)
    Discard(Window)
})

test("each window's pending seed is its own", () => {
    const first = Generate(Window)
    const second = Generate(OtherWindow)
    assert.notEqual(first, second)
    // One window's words retype nothing in another, and discarding one
    // window's seed leaves the other's where it was.
    assert.equal(Retype(OtherWindow, first), false)
    assert.equal(Retype(Window, first), true)
    Discard(Window)
    assert.equal(Retype(OtherWindow, second), true)
    assert.equal(Use(OtherWindow), second)
    Discard(OtherWindow)
})

test("starting over writes over what was pending", () => {
    const first = Generate(Window)
    Retype(Window, first)
    // Regenerating - backing out of the retype step - drops the retyped
    // words: the seed that gets stored is always the one last shown.
    const second = Generate(Window)
    assert.throws(() => Use(Window), /no retyped seed/)
    assert.equal(Retype(Window, first), false)
    assert.equal(Retype(Window, second), true)
    assert.equal(Use(Window), second)
    Discard(Window)
})
