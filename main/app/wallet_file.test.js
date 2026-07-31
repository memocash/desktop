const test = require("node:test");
const assert = require("node:assert");
const CryptoJS = require("crypto-js");
const {
    DecodeContents,
    EncodeContents,
    EncodePublic,
    EncodeWallet,
    IsEncrypted,
    ReadForm,
    Version,
    WrongPassword,
} = require("./wallet_file");

const Wallet = {
    time: "2026-07-29T00:00:00.000Z",
    seed: "abandon abandon abandon",
    keys: ["WIFone", "WIFtwo"],
    addresses: ["addr1", "addr2"],
    changeList: ["change1"],
    slpList: ["slp1"],
    derivation: {
        version: 1,
        addressCount: 20,
        accounts: {bch: "xpub-public-bch", slp: "xpub-public-slp"},
    },
    settings: {DirectTx: false, SkipPassword: true},
}

// What earlier releases wrote: bare JSON, or a CryptoJS passphrase blob.
const v1Plain = (wallet) => JSON.stringify(wallet)
const v1Encrypted = (wallet, password) => CryptoJS.AES.encrypt(JSON.stringify(wallet), password).toString()

test("an encrypted wallet round-trips and reports its version", async () => {
    const contents = await EncodeContents(Wallet, "hunter2")
    assert.equal(IsEncrypted(contents), true)
    const {wallet, encrypted, version} = await DecodeContents(contents, "hunter2")
    assert.equal(version, Version)
    assert.equal(encrypted, true)
    assert.deepEqual(wallet, Wallet)
    assert.equal(wallet.__publicMacKey, undefined)
})

// The point of the format: what is written constantly stays outside the
// envelope so those writes need no password, and everything that would let a
// reader of the file follow the wallet stays inside it.
test("only the write-hot metadata sits outside the envelope", async () => {
    const contents = await EncodeContents(Wallet, "hunter2")
    const doc = JSON.parse(contents)
    assert.deepEqual(Object.keys(doc.public).sort(),
        ["addresses", "changeList", "settings", "slpList", "time"])
    assert.equal(doc.public.seed, undefined)
    assert.equal(doc.public.keys, undefined)
    assert.equal(doc.public.derivation, undefined)
    // Nothing secret survives anywhere in the serialized file. The account xpubs
    // derive every address the wallet will ever use, so an encrypted file must
    // not carry them in the clear either.
    assert.ok(!contents.includes("abandon"))
    assert.ok(!contents.includes("WIFone"))
    assert.ok(!contents.includes("xpub-public-bch"))
})

// A version 2 file written before the derivation moved inside the envelope reads
// exactly the same, and says that it is holding a field in the wrong half so the
// caller can reseal it.
test("a secret field left in the public half is read and reported", async () => {
    const clean = await DecodeContents(await EncodeContents(Wallet, "hunter2"), "hunter2")
    assert.equal(clean.publicSecrets, false)
    assert.deepEqual(clean.wallet, Wallet)

    // An envelope with no derivation in it, and the derivation written beside it
    // in the public half - authenticated with that file's own key, the way the
    // earlier writer would have left it, so this tests the split and not the MAC.
    const {derivation, ...withoutDerivation} = Wallet
    const older = await EncodeWallet(withoutDerivation, "hunter2")
    const form = ReadForm(older.contents)
    const contents = EncodePublic(form.doc, {...form.doc.public, derivation}, older.integrityKey)

    const read = await DecodeContents(contents, "hunter2")
    assert.equal(read.publicSecrets, true)
    assert.deepEqual(read.wallet, Wallet)
})

test("the encrypted payload is authenticated, salted, and freshly nonced", async () => {
    const first = JSON.parse(await EncodeContents(Wallet, "hunter2"))
    const second = JSON.parse(await EncodeContents(Wallet, "hunter2"))
    assert.equal(first.keystore.encryption, "scrypt-aes-256-gcm")
    assert.equal(first.keystore.kdf.name, "scrypt")
    assert.equal(first.keystore.cipher.name, "aes-256-gcm")
    // A salt and nonce reused across wallets would leak far more than either.
    assert.notEqual(first.keystore.kdf.salt, second.keystore.kdf.salt)
    assert.notEqual(first.keystore.cipher.iv, second.keystore.cipher.iv)
    assert.notEqual(first.keystore.ciphertext, second.keystore.ciphertext)
})

test("a wrong password is reported as wrong rather than as junk plaintext", async () => {
    const contents = await EncodeContents(Wallet, "hunter2")
    await assert.rejects(DecodeContents(contents, "not-the-password"), {message: WrongPassword})
    await assert.rejects(DecodeContents(contents, ""), {message: WrongPassword})
    await assert.rejects(DecodeContents(contents, undefined), {message: WrongPassword})
})

// GCM is authenticated, so tampering has to fail closed rather than hand back
// bytes that happen to parse.
test("a tampered payload fails closed", async () => {
    for (const field of ["ciphertext", "tag", "iv", "salt"]) {
        const doc = JSON.parse(await EncodeContents(Wallet, "hunter2"))
        const target = field === "salt" ? doc.keystore.kdf : (field === "ciphertext" ? doc.keystore : doc.keystore.cipher)
        const key = field === "salt" ? "salt" : field
        const bytes = Buffer.from(target[key], "base64")
        bytes[0] ^= 0xff
        target[key] = bytes.toString("base64")
        await assert.rejects(DecodeContents(JSON.stringify(doc), "hunter2"),
            {message: WrongPassword}, "tampering with " + field + " should fail")
    }
})

test("a wallet with no password keeps its secrets out of the public half", async () => {
    const contents = await EncodeContents(Wallet, undefined)
    assert.equal(IsEncrypted(contents), false)
    const doc = JSON.parse(contents)
    assert.equal(doc.keystore.encryption, "none")
    assert.equal(doc.public.seed, undefined)
    assert.equal(doc.keystore.secret.seed, Wallet.seed)
    const {wallet, encrypted} = await DecodeContents(contents, undefined)
    assert.equal(encrypted, false)
    assert.deepEqual(wallet, Wallet)
})

test("a version 1 wallet without a password is read as version 1", async () => {
    const contents = v1Plain(Wallet)
    assert.equal(IsEncrypted(contents), false)
    const {wallet, encrypted, version} = await DecodeContents(contents, undefined)
    assert.equal(version, 1)
    assert.equal(encrypted, false)
    assert.deepEqual(wallet, Wallet)
})

test("a version 1 wallet with a password is read as version 1", async () => {
    const contents = v1Encrypted(Wallet, "hunter2")
    assert.equal(IsEncrypted(contents), true)
    const {wallet, encrypted, version} = await DecodeContents(contents, "hunter2")
    assert.equal(version, 1)
    assert.equal(encrypted, true)
    assert.deepEqual(wallet, Wallet)
    await assert.rejects(DecodeContents(contents, "wrong"), {message: WrongPassword})
})

test("public metadata is rewritten without touching the envelope", async () => {
    const contents = await EncodeContents(Wallet, "hunter2")
    const form = ReadForm(contents)
    const {integrityKey} = await DecodeContents(contents, "hunter2")
    const updated = EncodePublic(
        form.doc, {...form.doc.public, addresses: ["addr1", "addr2", "addr3"]}, integrityKey)
    // Byte-identical envelope: nothing was decrypted and nothing re-encrypted.
    assert.deepEqual(JSON.parse(updated).keystore, form.doc.keystore)
    const {wallet} = await DecodeContents(updated, "hunter2")
    assert.deepEqual(wallet.addresses, ["addr1", "addr2", "addr3"])
    assert.equal(wallet.seed, Wallet.seed)
})

test("tampering with public metadata fails authentication", async () => {
    for (const change of [
        (doc) => doc.public.addresses.unshift("attacker"),
        (doc) => doc.public.changeList = ["attacker"],
        (doc) => doc.public.slpList = ["attacker"],
        (doc) => doc.public.settings.SkipPassword = true,
    ]) {
        const doc = JSON.parse(await EncodeContents(
            {...Wallet, settings: {...Wallet.settings, SkipPassword: false}}, "hunter2"))
        change(doc)
        await assert.rejects(DecodeContents(JSON.stringify(doc), "hunter2"),
            {message: WrongPassword})
    }
})

test("file-controlled scrypt parameters are refused before derivation", async () => {
    for (const [field, value] of [
        ["N", 65536],
        ["r", 16],
        ["p", 1000000],
        ["keyLength", 1024],
    ]) {
        const doc = JSON.parse(await EncodeContents(Wallet, "hunter2"))
        doc.keystore.kdf[field] = value
        await assert.rejects(DecodeContents(JSON.stringify(doc), "hunter2"),
            {message: new RegExp("unsupported key derivation parameter: " + field)})
    }
    const doc = JSON.parse(await EncodeContents(Wallet, "hunter2"))
    doc.keystore.kdf.salt = Buffer.alloc(64).toString("base64")
    await assert.rejects(DecodeContents(JSON.stringify(doc), "hunter2"),
        {message: /unsupported key derivation salt/})
})

test("a file that is neither version is refused with a controlled error", async () => {
    assert.throws(() => ReadForm('{"version":99,"public":{},"keystore":{}}'),
        {message: /unsupported wallet version: 99/})
    assert.throws(() => ReadForm('{"version":2}'), {message: /no keystore/})
    await assert.rejects(
        DecodeContents('{"version":2,"public":{},"keystore":{"encryption":"rot13"}}', "hunter2"),
        {message: /unsupported wallet encryption: rot13/})
})
