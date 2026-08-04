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
    DefaultSettings,
    ForgetPaths,
    FreeGuesses,
    GuessDelayMs,
    IsWalletArtifact,
    MigrateWallet,
    NewWallet,
    PublicWallet,
    ReadAndMigrateWallet,
    ReadWallet,
    ResolveWalletPath,
    TightenWalletPermissions,
    UpdatePublic,
    UpdateTouchesSecret,
    Version,
    WalletFileState,
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
    // Settings the same way, and a wallet that has stored one keeps it: reading
    // must never be the thing that decides a wallet's spend budget.
    assert.deepEqual(PublicWallet({}).settings, DefaultSettings)
    assert.equal(publicState.settings.PasswordThreshold, 0)
    assert.equal(PublicWallet({settings: {PasswordThreshold: 5000}}).settings.PasswordThreshold, 5000)
    assert.equal(PublicWallet({settings: {DirectTx: true}}).settings.DirectTx, true)
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

// The load screen offers to create a wallet for a name with no file behind it,
// and refuses a name it cannot use at all. Those must not look the same: a
// refusal reported as "no wallet yet" walks someone through type, seed, seed
// confirmation and password before the write fails.
test("a name with no file is not the same answer as a name that cannot be used", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const missing = path.join(dir, "not_here_yet")
    AllowPath(Window, missing)
    assert.deepEqual(await WalletFileState(Window, missing), {exists: false, encrypted: false})
    await assert.rejects(WalletFileState(Window, "sub/evil"), {message: /wallet name/})
    await assert.rejects(WalletFileState(OtherWindow, missing), {message: /not chosen by the user/})
})

// A file that is there but this version cannot parse is its own answer again:
// no password would open it, so the screen must not offer a password box.
test("a file that cannot be read is reported rather than called unencrypted", async () => {
    const walletPath = await tempWallet("unreadable")
    await fs.writeFile(walletPath, JSON.stringify({version: 99}))
    await assert.rejects(WalletFileState(Window, walletPath), {message: /unsupported wallet version/})
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
    assert.deepEqual(await WalletFileState(Window, walletPath), {exists: true, encrypted: true})
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
    assert.deepEqual(await WalletFileState(Window, walletPath), {exists: true, encrypted: false})
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
    // A wallet asks for its password - or, passwordless, an approval - on every
    // send until someone says otherwise.
    assert.deepEqual(wallet.settings, {DirectTx: false, PasswordThreshold: 0, ConfirmSends: true})
    ApplyWalletUpdate(wallet, "changeSettings", {PasswordThreshold: 10000})
    assert.deepEqual(wallet.settings, {DirectTx: false, PasswordThreshold: 10000, ConfirmSends: true})
    ApplyWalletUpdate(wallet, "changeSettings", {DirectTx: true})
    assert.deepEqual(wallet.settings, {DirectTx: true, PasswordThreshold: 10000, ConfirmSends: true})
    ApplyWalletUpdate(wallet, "changeSettings", {ConfirmSends: false})
    assert.deepEqual(wallet.settings, {DirectTx: true, PasswordThreshold: 10000, ConfirmSends: false})
})

test("a spend budget has to be a whole number of satoshis", () => {
    for (const threshold of ["10000", 1.5, -1, Infinity, NaN, null]) {
        assert.throws(() => ApplyWalletUpdate({}, "changeSettings", {PasswordThreshold: threshold}),
            {message: /whole number of satoshis/}, "accepted " + threshold)
    }
    // The confirmation switch is policy the same way, so its shape is held to
    // the same standard: a boolean or nothing.
    for (const confirm of ["off", 0, 1, null]) {
        assert.throws(() => ApplyWalletUpdate({}, "changeSettings", {ConfirmSends: confirm}),
            {message: /on or off/}, "accepted " + confirm)
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

// Existing wallets are version 1. They have to keep opening, but the rewrite
// must not leave the original beside the new file: the old format's encryption
// is what the migration exists to retire, and a surviving copy of it keeps the
// seed exactly that guessable for anyone who can read the directory.
test("a version 1 wallet migrates on read and leaves no copy of the old format", async () => {
    const walletPath = await tempWallet("legacy")
    const original = CryptoJS.AES.encrypt(
        JSON.stringify({seed: "old seed words", keys: [], addresses: ["addr1"]}), "hunter2").toString()
    await fs.writeFile(walletPath, original)

    const read = await ReadWallet(walletPath, "hunter2")
    assert.equal(read.version, 1)
    assert.equal(read.wallet.seed, "old seed words")

    await MigrateWallet(walletPath, read.wallet, "hunter2")

    const migrated = await ReadWallet(walletPath, "hunter2")
    assert.equal(migrated.version, Version)
    assert.equal(migrated.encrypted, true)
    assert.equal(migrated.wallet.seed, "old seed words")
    assert.deepEqual(migrated.wallet.addresses, ["addr1"])
    assert.deepEqual(await fs.readdir(path.dirname(walletPath)), ["legacy"])
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

// The copy is the way back only while the rewrite can still fail; a rewrite
// that never proved readable must leave it in place.
test("a failed migration keeps the copy of the original", async () => {
    const walletPath = await tempWallet("legacy_failed")
    const original = JSON.stringify({seed: "the original", keys: [], addresses: []})
    await fs.writeFile(walletPath, original)
    // A BigInt makes the rewrite's JSON encoding throw after the copy is taken.
    await assert.rejects(MigrateWallet(walletPath, {seed: 1n, keys: [], addresses: []}, undefined))
    assert.equal(await fs.readFile(walletPath + ".v1.bak", {encoding: "utf8"}), original)
})

// Wallets migrated by earlier releases, which kept the copy forever, still have
// one sitting beside the file. Opening the wallet is the moment the copy is
// provably redundant - the current file just decoded with the user's password -
// so that is when the leftovers go, and only the shapes migration wrote.
test("leftover migration copies are removed when the wallet opens", async () => {
    const walletPath = await tempWallet("tidied")
    await WriteWallet(walletPath, NewWallet("seed words here", [], []), "hunter2")
    await fs.writeFile(walletPath + ".v1.bak", "old ciphertext")
    await fs.writeFile(walletPath + ".v1.bak.1", "old ciphertext")
    await fs.writeFile(walletPath + ".v1.bakelite", "a neighbour that merely looks similar")
    const read = await ReadAndMigrateWallet(walletPath, "hunter2")
    assert.equal(read.version, Version)
    assert.deepEqual((await fs.readdir(path.dirname(walletPath))).sort(),
        ["tidied", "tidied.v1.bakelite"])
})

// A wallet file is worth exactly a wallet. Every path that writes one passes a
// mode, and the open path re-modes files written back when no mode was passed
// and the umask decided - which usually meant world-readable.
test("wallet files are readable by their owner alone", async (t) => {
    if (process.platform === "win32") {
        return t.skip("posix file modes")
    }
    const mode = async (file) => (await fs.stat(file)).mode & 0o777
    const created = await tempWallet("created")
    await CreateWalletFile(created, NewWallet("seed words here", [], []), "hunter2")
    assert.equal(await mode(created), 0o600)
    await WriteWallet(created, NewWallet("seed words here", [], ["addr1"]), "hunter2")
    assert.equal(await mode(created), 0o600)

    const loose = await tempWallet("loose")
    await WriteWallet(loose, NewWallet("seed words here", [], []), "hunter2")
    await fs.chmod(loose, 0o644)
    await ReadAndMigrateWallet(loose, "hunter2")
    assert.equal(await mode(loose), 0o600)
})

// The startup pass is the only thing that repairs what earlier releases wrote
// at the umask's mercy, so it gets its own test rather than hiding behind the
// green write-path tests above. Dir.DefaultPath is pointed at a scratch tree
// for the call and restored, the same object every keystore function reads.
test("startup tightens the modes earlier releases left behind", async (t) => {
    if (process.platform === "win32") {
        return t.skip("posix file modes")
    }
    const mode = async (file) => (await fs.stat(file)).mode & 0o777
    const memoDir = path.join(
        await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-")), ".memo")
    const walletDir = path.join(memoDir, "wallets")
    await fs.mkdir(walletDir, {recursive: true})
    await fs.chmod(memoDir, 0o755)
    await fs.chmod(walletDir, 0o755)
    const wallet = path.join(walletDir, "old_wallet")
    await fs.writeFile(wallet, "{}")
    await fs.chmod(wallet, 0o644)
    // A subdirectory is not a wallet; only regular files are re-moded.
    const subdir = path.join(walletDir, "not_a_file")
    await fs.mkdir(subdir)
    await fs.chmod(subdir, 0o755)
    const original = Dir.DefaultPath
    Dir.DefaultPath = walletDir
    try {
        await TightenWalletPermissions()
    } finally {
        Dir.DefaultPath = original
    }
    assert.equal(await mode(memoDir), 0o700)
    assert.equal(await mode(walletDir), 0o700)
    assert.equal(await mode(wallet), 0o600)
    assert.equal(await mode(subdir), 0o755)
})

// A first run has no directory to tighten yet, and startup must not fail on
// that - the pass is best-effort by design. The absent path hangs under a
// fresh mkdtemp root so it is provably absent, rather than a fixed /tmp name
// that a previous run or another process could have left something at.
test("the startup permission pass tolerates a missing wallet directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "memo-keystore-"))
    const absent = path.join(root, ".memo", "wallets")
    await assert.rejects(fs.access(absent))
    const original = Dir.DefaultPath
    Dir.DefaultPath = absent
    try {
        await TightenWalletPermissions()
        // Tightening what exists must not include inventing what does not.
        await assert.rejects(fs.access(absent))
    } finally {
        Dir.DefaultPath = original
        await fs.rm(root, {recursive: true, force: true})
    }
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
    assert.deepEqual(files.filter((name) => name.includes(".v1.bak")), [])
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

test("the guess delay is free at first, then doubles, then stops climbing", () => {
    for (let misses = 0; misses <= FreeGuesses; misses++) {
        assert.equal(GuessDelayMs(misses), 0)
    }
    assert.equal(GuessDelayMs(FreeGuesses + 1), 1000)
    assert.equal(GuessDelayMs(FreeGuesses + 2), 2000)
    assert.equal(GuessDelayMs(FreeGuesses + 3), 4000)
    assert.equal(GuessDelayMs(FreeGuesses + 50), 30000)
})

test("wrong passwords slow a file down, and the right one clears the slate", async () => {
    const walletPath = await tempWallet("guessed_at")
    await CreateWalletFile(walletPath, NewWallet("seed words", [], []), "hunter2")
    const miss = () => assert.rejects(ReadWallet(walletPath, "wrong"), {message: WrongPassword})

    // The free misses, plus the attempt that reaches the first priced delay.
    for (let guess = 0; guess <= FreeGuesses; guess++) {
        await miss()
    }
    // The next attempt pays: it waits out the schedule before it even reads.
    const slowed = Date.now()
    await miss()
    assert.ok(Date.now() - slowed >= GuessDelayMs(FreeGuesses + 1),
        "the attempt after the free misses must wait out the delay")

    // The right password still opens the wallet - slower, never locked out -
    // and resets the count: the next miss is back on the house.
    const opened = await ReadWallet(walletPath, "hunter2")
    assert.equal(opened.wallet.seed, "seed words")
    const fresh = Date.now()
    await miss()
    assert.ok(Date.now() - fresh < GuessDelayMs(FreeGuesses + 1),
        "a miss after a successful open must be free again")
    await ReadWallet(walletPath, "hunter2")
})

// The burst case: guesses fired together, before any miss has been recorded.
// A gate keyed on the recorded count would admit them all at once; queueing
// from the first offered password makes the tail of the burst wait out the
// schedule exactly as sequential guesses would.
test("a parallel burst of guesses lines up instead of slipping past the meter", async () => {
    const walletPath = await tempWallet("burst_guessed")
    await CreateWalletFile(walletPath, NewWallet("seed words", [], []), "hunter2")
    const start = Date.now()
    const burst = await Promise.allSettled(Array.from(
        {length: FreeGuesses + 2}, () => ReadWallet(walletPath, "wrong")))
    for (const attempt of burst) {
        assert.equal(attempt.status, "rejected")
        assert.equal(attempt.reason.message, WrongPassword)
    }
    assert.ok(Date.now() - start >= GuessDelayMs(FreeGuesses + 1),
        "the last guess of the burst must pay for the misses queued ahead of it")
    // The owner is still not locked out, and being right still clears the count.
    const opened = await ReadWallet(walletPath, "hunter2")
    assert.equal(opened.wallet.seed, "seed words")
})
