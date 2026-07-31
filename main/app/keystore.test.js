const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const CryptoJS = require("crypto-js");
const {Dir} = require("../common/util");
const {
    AllowPath,
    ApplyWalletUpdate,
    CreateWalletFile,
    ForgetPaths,
    IsWalletArtifact,
    MigrateWallet,
    NewWallet,
    PublicWallet,
    ReadAndMigrateWallet,
    ReadWallet,
    ResolveWalletPath,
    UpdatePublic,
    UpdateTouchesSecret,
    Version,
    WalletFileIsEncrypted,
    WithWalletLock,
    WriteWallet,
    WrongPassword,
} = require("./keystore");

// Stands in for a webContents id. Grants are per window, so tests that care
// about the boundary use two.
const Window = 1
const OtherWindow = 2

// Wallets written by these tests go to a scratch directory, reached the same way
// the import flow reaches a wallet outside Dir.DefaultPath: the path is vouched
// for first, as the file dialog does.
const tempWallet = async (name) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const walletPath = path.join(dir, name)
    AllowPath(Window, walletPath)
    return walletPath
}

test("a plain wallet name resolves inside the wallet directory", () => {
    assert.equal(ResolveWalletPath(Window, "default_wallet"), Dir.DefaultPath + path.sep + "default_wallet")
    assert.equal(ResolveWalletPath(Window, "  spaced  "), Dir.DefaultPath + path.sep + "spaced")
})

test("renderer wallet state contains capabilities but no private material", () => {
    const publicState = PublicWallet({
        seed: "secret seed words",
        keys: ["private WIF"],
        addresses: ["addr1"],
        settings: {SkipPassword: false},
    })
    assert.equal(publicState.seed, undefined)
    assert.equal(publicState.keys, undefined)
    assert.equal(publicState.canSign, true)
    assert.equal(publicState.walletType, "seed")
    assert.deepEqual(publicState.addresses, ["addr1"])
    assert.equal(PublicWallet({keys: ["WIF"], addresses: []}).walletType, "imported")
    assert.equal(PublicWallet({keys: [], addresses: ["watch"]}).walletType, "watch")
    assert.equal(PublicWallet({keys: [], addresses: ["watch"]}).canSign, false)
    // The lists are always present, so no caller has to have one created first.
    assert.deepEqual(PublicWallet({}).addresses, [])
    assert.deepEqual(PublicWallet({}).changeList, [])
    assert.deepEqual(PublicWallet({}).slpList, [])
})

// The wallet list is what the load screen checks a suggested name against, so a
// backup or a stranded temp file listed there is offered as a wallet that cannot
// be opened. Matching what this module writes, rather than excluding every name
// with a dot, keeps a wallet somebody really named "my.wallet" visible.
test("the files a wallet write leaves behind are not wallets", () => {
    for (const artifact of [
        "default_wallet.v1.bak",
        "default_wallet.v1.bak.1",
        "default_wallet.12345.0.tmp",
    ]) {
        assert.equal(IsWalletArtifact(artifact), true, artifact + " should not be listed")
    }
    for (const wallet of ["default_wallet", "wallet_1", "my.wallet", "backup.v1"]) {
        assert.equal(IsWalletArtifact(wallet), false, wallet + " is a wallet name")
    }
})

test("a name that would escape the wallet directory is refused", () => {
    for (const name of ["../evil", "sub/evil", "..", ".", "", "   "]) {
        assert.throws(() => ResolveWalletPath(Window, name), {message: /wallet name/})
    }
})

test("a full path is refused unless the user chose it in a dialog", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const outside = path.join(dir, "somewhere_else")
    assert.throws(() => ResolveWalletPath(Window, outside), {message: /not chosen by the user/})
    AllowPath(Window, outside)
    assert.equal(ResolveWalletPath(Window, outside), outside)
})

// Choosing a wallet in one window must not hand every other window a way to
// reach it. Otherwise one import opens that file to any renderer in the process
// - to read an unencrypted wallet's seed, or to write over it.
test("a path one window was granted is not reachable from another", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const outside = path.join(dir, "imported")
    AllowPath(Window, outside)
    assert.equal(ResolveWalletPath(Window, outside), outside)
    assert.throws(() => ResolveWalletPath(OtherWindow, outside), {message: /not chosen by the user/})
})

test("a window's grants go when the window does", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const outside = path.join(dir, "imported")
    AllowPath(OtherWindow, outside)
    assert.equal(ResolveWalletPath(OtherWindow, outside), outside)
    ForgetPaths(OtherWindow)
    assert.throws(() => ResolveWalletPath(OtherWindow, outside), {message: /not chosen by the user/})
})

// Opening a wallet is not permission to replace it, and neither is naming one in
// the wallet directory. The load screen only offers create for a name with no
// file behind it, so anything else reaching create did not come from there.
test("creating a wallet never writes over a file that already exists", async () => {
    const walletPath = await tempWallet("taken")
    await CreateWalletFile(walletPath, NewWallet("first seed words", [], []), "hunter2")
    await assert.rejects(
        CreateWalletFile(walletPath, NewWallet("second seed words", [], []), "other"),
        {code: "EEXIST"})
    const {wallet} = await ReadWallet(walletPath, "hunter2")
    assert.equal(wallet.seed, "first seed words")
})

test("an encrypted wallet round-trips through the file", async () => {
    const walletPath = await tempWallet("encrypted")
    const wallet = NewWallet("seed words here", [], ["addr1"])
    await WriteWallet(walletPath, wallet, "hunter2")
    assert.equal(await WalletFileIsEncrypted(Window, walletPath), true)
    const {wallet: read, encrypted} = await ReadWallet(walletPath, "hunter2")
    assert.equal(encrypted, true)
    assert.equal(read.seed, "seed words here")
    assert.deepEqual(read.addresses, ["addr1"])
})

test("the wrong password is reported as wrong rather than throwing something else", async () => {
    const walletPath = await tempWallet("encrypted")
    await WriteWallet(walletPath, NewWallet("seed words here", [], []), "hunter2")
    await assert.rejects(ReadWallet(walletPath, "not-the-password"), {message: WrongPassword})
    await assert.rejects(ReadWallet(walletPath, ""), {message: WrongPassword})
    await assert.rejects(ReadWallet(walletPath, undefined), {message: WrongPassword})
})

test("a wallet saved without a password stays readable JSON and reads back unencrypted", async () => {
    const walletPath = await tempWallet("plain")
    await WriteWallet(walletPath, NewWallet("", ["WIFkey"], ["addr1"]), undefined)
    assert.equal(await WalletFileIsEncrypted(Window, walletPath), false)
    const {wallet, encrypted} = await ReadWallet(walletPath, undefined)
    assert.equal(encrypted, false)
    assert.deepEqual(wallet.keys, ["WIFkey"])
})

test("list updates add, de-duplicate, and remove", () => {
    const wallet = {}
    ApplyWalletUpdate(wallet, "addAddresses", ["a", "b", "a"])
    assert.deepEqual(wallet.addresses, ["a", "b"])
    ApplyWalletUpdate(wallet, "addAddresses", ["b", "c"])
    assert.deepEqual(wallet.addresses, ["a", "b", "c"])
    ApplyWalletUpdate(wallet, "removeAddresses", ["b"])
    assert.deepEqual(wallet.addresses, ["a", "c"])
    ApplyWalletUpdate(wallet, "addKeys", ["k1"])
    ApplyWalletUpdate(wallet, "removeKeys", ["k1"])
    assert.deepEqual(wallet.keys, [])
})

test("changing settings fills in the defaults and keeps untouched values", () => {
    const wallet = {}
    ApplyWalletUpdate(wallet, "changeSettings", {})
    // A wallet asks for its password on every send until someone says otherwise.
    assert.deepEqual(wallet.settings, {DirectTx: false, PasswordThreshold: 0})
    ApplyWalletUpdate(wallet, "changeSettings", {PasswordThreshold: 10000})
    assert.deepEqual(wallet.settings, {DirectTx: false, PasswordThreshold: 10000})
    ApplyWalletUpdate(wallet, "changeSettings", {DirectTx: true})
    assert.deepEqual(wallet.settings, {DirectTx: true, PasswordThreshold: 10000})
})

test("a spend budget has to be a whole number of satoshis", () => {
    for (const threshold of ["10000", 1.5, -1, Infinity, NaN, null]) {
        assert.throws(() => ApplyWalletUpdate({}, "changeSettings", {PasswordThreshold: threshold}),
            {message: /whole number of satoshis/}, "accepted " + threshold)
    }
    // Zero is a policy, not a missing value: it means ask every time.
    const wallet = {}
    ApplyWalletUpdate(wallet, "changeSettings", {PasswordThreshold: 0})
    assert.equal(wallet.settings.PasswordThreshold, 0)
})

// The wallet page asks for the wallet from several components as it mounts, so
// these read-modify-writes overlap. Without the lock an update reads a file that
// another is midway through replacing, and a torn ciphertext reads back as a
// wrong password rather than as corruption.
test("overlapping updates to one wallet each land, without tearing the file", async () => {
    const walletPath = await tempWallet("busy")
    await WriteWallet(walletPath, NewWallet("seed words here", [], []), "hunter2")
    const addresses = Array.from({length: 25}, (_, i) => "addr" + i)
    await Promise.all(addresses.map((address) => WithWalletLock(walletPath, async () => {
        const {wallet} = await ReadWallet(walletPath, "hunter2")
        ApplyWalletUpdate(wallet, "addAddresses", [address])
        await WriteWallet(walletPath, wallet, "hunter2")
    })))
    const {wallet} = await ReadWallet(walletPath, "hunter2")
    assert.deepEqual([...wallet.addresses].sort(), [...addresses].sort())
})

// Existing wallets are version 1. They have to keep opening, and the copy taken
// before the rewrite is the user's way back if the new format has a problem.
test("a version 1 wallet migrates on read, keeping the original beside it", async () => {
    const walletPath = await tempWallet("legacy")
    const original = CryptoJS.AES.encrypt(
        JSON.stringify({seed: "old seed words", keys: [], addresses: ["addr1"]}), "hunter2").toString()
    await fs.writeFile(walletPath, original)

    const read = await ReadWallet(walletPath, "hunter2")
    assert.equal(read.version, 1)
    assert.equal(read.wallet.seed, "old seed words")

    const {backupPath} = await MigrateWallet(walletPath, read.wallet, "hunter2")
    assert.equal(backupPath, walletPath + ".v1.bak")
    assert.equal(await fs.readFile(backupPath, {encoding: "utf8"}), original)

    const migrated = await ReadWallet(walletPath, "hunter2")
    assert.equal(migrated.version, Version)
    assert.equal(migrated.encrypted, true)
    assert.equal(migrated.wallet.seed, "old seed words")
    assert.deepEqual(migrated.wallet.addresses, ["addr1"])
})

test("an unencrypted version 1 wallet migrates without gaining a password", async () => {
    const walletPath = await tempWallet("legacy_plain")
    await fs.writeFile(walletPath, JSON.stringify({seed: "old seed words", keys: [], addresses: []}))
    const read = await ReadWallet(walletPath, undefined)
    assert.equal(read.version, 1)
    await MigrateWallet(walletPath, read.wallet, undefined)
    const migrated = await ReadWallet(walletPath, undefined)
    assert.equal(migrated.version, Version)
    assert.equal(migrated.encrypted, false)
    assert.equal(migrated.wallet.seed, "old seed words")
})

test("migrating twice never writes over the first backup", async () => {
    const walletPath = await tempWallet("legacy_twice")
    await fs.writeFile(walletPath, JSON.stringify({seed: "the original", keys: [], addresses: []}))
    const {backupPath: first} =
        await MigrateWallet(walletPath, {seed: "the original", keys: [], addresses: []}, undefined)
    const {backupPath: second} =
        await MigrateWallet(walletPath, {seed: "later", keys: [], addresses: []}, undefined)
    assert.notEqual(first, second)
    assert.match(JSON.parse(await fs.readFile(first, {encoding: "utf8"})).seed, /the original/)
})

test("concurrent unlocks migrate a legacy wallet only once", async () => {
    const walletPath = await tempWallet("legacy_concurrent")
    await fs.writeFile(walletPath, JSON.stringify({seed: "the original", keys: [], addresses: ["addr1"]}))
    const [first, second] = await Promise.all([
        ReadAndMigrateWallet(walletPath, undefined),
        ReadAndMigrateWallet(walletPath, undefined),
    ])
    assert.equal(first.version, Version)
    assert.equal(second.version, Version)
    assert.deepEqual(first.wallet.addresses, ["addr1"])
    assert.deepEqual(second.wallet.addresses, ["addr1"])
    const files = await fs.readdir(path.dirname(walletPath))
    assert.deepEqual(files.filter((name) => name.includes(".v1.bak")), ["legacy_concurrent.v1.bak"])
})

// The routine writes - a new address, a changed setting - must not need the
// password, which is what lets the window stop holding one.
test("a public update rewrites the wallet without the password", async () => {
    const walletPath = await tempWallet("public_only")
    await WriteWallet(walletPath, NewWallet("seed words here", ["WIFkey"], ["addr1"]), "hunter2")
    const {integrityKey} = await ReadWallet(walletPath, "hunter2")
    await UpdatePublic(walletPath, integrityKey, (publicData) =>
        ApplyWalletUpdate(publicData, "addAddresses", ["addr2"]))
    const {wallet} = await ReadWallet(walletPath, "hunter2")
    assert.deepEqual(wallet.addresses, ["addr1", "addr2"])
    assert.equal(wallet.seed, "seed words here")
    assert.deepEqual(wallet.keys, ["WIFkey"])
})

test("a public update cannot be signed with another wallet's integrity key", async () => {
    const walletPath = await tempWallet("wrong_integrity_key")
    const otherPath = await tempWallet("other_integrity_key")
    await WriteWallet(walletPath, NewWallet("seed words here", [], ["addr1"]), "hunter2")
    await WriteWallet(otherPath, NewWallet("other seed words", [], ["other"]), "hunter2")
    const {integrityKey: wrongKey} = await ReadWallet(otherPath, "hunter2")
    await assert.rejects(
        UpdatePublic(walletPath, wrongKey, (publicData) =>
            ApplyWalletUpdate(publicData, "addAddresses", ["attacker"])),
        {message: WrongPassword})
    const {wallet} = await ReadWallet(walletPath, "hunter2")
    assert.deepEqual(wallet.addresses, ["addr1"])
})

test("a secret update preserves the key used to authenticate public metadata", async () => {
    const walletPath = await tempWallet("secret_update")
    await WriteWallet(walletPath, NewWallet("seed words here", ["key1"], ["addr1"]), "hunter2")
    const before = await ReadWallet(walletPath, "hunter2")
    ApplyWalletUpdate(before.wallet, "addKeys", ["key2"])
    const returnedKey = await WriteWallet(
        walletPath, before.wallet, "hunter2", before.integrityKey)
    assert.deepEqual(returnedKey, before.integrityKey)
    await UpdatePublic(walletPath, before.integrityKey, (publicData) =>
        ApplyWalletUpdate(publicData, "addAddresses", ["addr2"]))
    const after = await ReadWallet(walletPath, "hunter2")
    assert.deepEqual(after.wallet.keys, ["key1", "key2"])
    assert.deepEqual(after.wallet.addresses, ["addr1", "addr2"])
})

test("only the updates reaching imported keys need the envelope opened", () => {
    for (const op of ["addAddresses", "removeAddresses", "changeSettings"]) {
        assert.equal(UpdateTouchesSecret(op), false, op + " should not need the envelope")
    }
    for (const op of ["addKeys", "removeKeys"]) {
        assert.equal(UpdateTouchesSecret(op), true, op + " should need the envelope")
    }
})

test("an update the keystore doesn't define is refused", () => {
    assert.throws(() => ApplyWalletUpdate({}, "addSeed", ["nope"]), {message: /unknown wallet update/})
    // The change and SLP lists come from the account keys in main, so there is
    // no longer an op that appends to them from outside.
    for (const op of ["addChangeList", "addSlpList"]) {
        assert.throws(() => ApplyWalletUpdate({}, op, ["addr"]), {message: /unknown wallet update/})
    }
    assert.throws(() => ApplyWalletUpdate({}, "addAddresses", "not-a-list"), {message: /list of values/})
})
