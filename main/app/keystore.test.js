const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {Dir} = require("../common/util");
const {
    AllowPath,
    ApplyWalletUpdate,
    CreateWalletFile,
    ForgetPaths,
    NewWallet,
    ReadWallet,
    ResolveWalletPath,
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
    assert.deepEqual(wallet.settings, {DirectTx: false, SkipPassword: true})
    ApplyWalletUpdate(wallet, "changeSettings", {SkipPassword: false})
    assert.deepEqual(wallet.settings, {DirectTx: false, SkipPassword: false})
    ApplyWalletUpdate(wallet, "changeSettings", {DirectTx: true})
    assert.deepEqual(wallet.settings, {DirectTx: true, SkipPassword: false})
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

test("an update the keystore doesn't define is refused", () => {
    assert.throws(() => ApplyWalletUpdate({}, "addSeed", ["nope"]), {message: /unknown wallet update/})
    assert.throws(() => ApplyWalletUpdate({}, "addAddresses", "not-a-list"), {message: /list of values/})
})
