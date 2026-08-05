const test = require("node:test");
const assert = require("node:assert");
const {fromBase58, fromSeed} = require("./bip32");
const golden = require("./bip32_golden.json");

// bip32_golden.json holds the removed package's outputs for the BIP32 spec
// test-vector seeds and for the app's own account paths - captured live
// before removal, with the spec vectors cross-checked against the published
// strings. Holding to them is holding to both the package and the spec.

const checkNode = (node, fixture, what) => {
    assert.equal(node.neutered().toBase58(), fixture.xpub, what + " xpub")
    assert.equal(node.publicKey.toString("hex"), fixture.publicKey, what + " publicKey")
    assert.equal(node.chainCode.toString("hex"), fixture.chainCode, what + " chainCode")
    assert.equal(node.depth, fixture.depth, what + " depth")
    assert.equal(node.index, fixture.index, what + " index")
    assert.equal(node.parentFingerprint, fixture.parentFingerprint, what + " parentFingerprint")
    if (fixture.xprv) {
        assert.equal(node.toBase58(), fixture.xprv, what + " xprv")
        assert.equal(node.toWIF(), fixture.wif, what + " wif")
    }
}

test("the BIP32 spec vectors reproduce, hardened and normal, at every depth", () => {
    for (const vector of golden.spec) {
        const root = fromSeed(Buffer.from(vector.seed, "hex"))
        for (const chain of vector.chains) {
            const node = chain.path === "m" ? root : root.derivePath(chain.path)
            checkNode(node, chain, vector.seed.slice(0, 8) + " " + chain.path)
        }
    }
})

test("the wallet's account paths derive the captured keys on both sides", () => {
    const {mnemonicToSeedSync} = require("bip39")
    const root = fromSeed(mnemonicToSeedSync(golden.mnemonic))
    for (const [name, account] of Object.entries(golden.wallet)) {
        const node = root.derivePath(account.path)
        checkNode(node, account.account, name)
        const fromXpub = fromBase58(account.account.xpub)
        assert.equal(fromXpub.isNeutered(), true)
        for (const child of account.children) {
            const derived = node.derive(child.branch).derive(child.i)
            assert.equal(derived.toWIF(), child.wif, name + " wif " + child.branch + "/" + child.i)
            assert.equal(derived.publicKey.toString("hex"), child.publicKey)
            // The public side must land on the same key without ever holding one.
            assert.equal(fromXpub.derive(child.branch).derive(child.i).publicKey.toString("hex"),
                child.publicSide)
            assert.equal(child.publicKey, child.publicSide)
        }
    }
})

test("serializations round-trip through fromBase58", () => {
    const root = fromSeed(Buffer.from(golden.spec[0].seed, "hex"))
    const account = root.derivePath("m/44'/0'/0'")
    for (const node of [account, account.neutered()]) {
        const parsed = fromBase58(node.toBase58())
        assert.equal(parsed.toBase58(), node.toBase58())
        assert.equal(parsed.publicKey.toString("hex"), node.publicKey.toString("hex"))
        assert.equal(parsed.depth, node.depth)
        assert.equal(parsed.parentFingerprint, node.parentFingerprint)
    }
})

test("what must be refused is refused", () => {
    const root = fromSeed(Buffer.from(golden.spec[0].seed, "hex"))
    assert.throws(() => fromSeed(Buffer.alloc(8)), /128 and 512 bits/)
    assert.throws(() => fromSeed(Buffer.alloc(65)), /128 and 512 bits/)
    assert.throws(() => root.neutered().derive(0x80000000), /Missing private key/)
    assert.throws(() => root.neutered().toWIF(), /Missing private key/)
    assert.throws(() => root.derive(-1), /UInt32/)
    assert.throws(() => root.derive(0x100000000), /UInt32/)
    assert.throws(() => root.derivePath("m"), /BIP32Path/)
    assert.throws(() => root.derivePath("m/x/1"), /BIP32Path/)
    assert.throws(() => root.derivePath(undefined), /BIP32Path/)
    assert.throws(() => root.derive(0).derivePath("m/1"), /Expected master/)
    assert.throws(() => fromBase58("1111111111111111111114oLvT2"), /length/)
    // A WIF is valid base58check but not an extended key.
    assert.throws(() => fromBase58(root.toWIF()))
})
