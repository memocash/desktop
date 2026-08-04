const fs = require("fs/promises")
const path = require("path")
const {Dir} = require("../common/util")
const {Serialize} = require("./serial")
const walletFile = require("./wallet_file")

// Every wallet read, write, and decryption lives here rather than in the preload
// so the renderer never holds a file handle or a cipher. The renderer names a
// wallet; it never supplies a path this module hasn't already vouched for. The
// on-disk format itself lives in ./wallet_file.

const {WrongPassword} = walletFile

// Wallets normally live in Dir.DefaultPath, but the import flow lets the user
// point at a file anywhere. Choosing one in a dialog grants that one window the
// right to open that one file, and only for as long as the window lives - not
// every window in the process, and not forever, or one import would leave the
// path open to any renderer for the rest of the run.
const pickedPaths = new Map()

const AllowPath = (winId, walletPath) => {
    if (!pickedPaths.has(winId)) {
        pickedPaths.set(winId, new Set())
    }
    pickedPaths.get(winId).add(walletPath)
}

const ForgetPaths = (winId) => pickedPaths.delete(winId)

const ResolveWalletPath = (winId, walletName) => {
    const name = (walletName || "").trim()
    if (!name.length) {
        throw new Error("wallet name is empty")
    }
    if (Dir.IsFullPath(name)) {
        const allowed = pickedPaths.get(winId)
        if (!allowed || !allowed.has(name)) {
            throw new Error("wallet path was not chosen by the user")
        }
        return name
    }
    // A bare name only - anything with a separator or a parent reference would
    // resolve outside the wallet directory.
    if (name !== path.basename(name) || name === "." || name === "..") {
        throw new Error("wallet name is not a plain file name")
    }
    return Dir.DefaultPath + path.sep + name
}

// What this module leaves beside the wallets: backupWalletFile's copy and
// writeContents' scratch file, which a crash can strand. Matched rather than
// excluding every name with a dot, since ResolveWalletPath accepts any plain
// basename - "my.wallet" is a wallet somebody can really have.
const IsWalletArtifact = (file) => /(\.v1\.bak(\.\d+)?|\.\d+\.\d+\.tmp)$/.test(file)

const ListWalletFiles = async () => {
    await fs.mkdir(Dir.DefaultPath, {recursive: true, mode: 0o700})
    const files = await fs.readdir(Dir.DefaultPath)
    return files.filter(file => !IsWalletArtifact(file))
}

// A wallet file is worth exactly a wallet, so nobody else on the machine gets
// to read one. Every write here passes a mode, but mkdir and writeFile only
// apply theirs when they create - what earlier releases wrote landed at
// whatever the umask allowed, which is usually world-readable. Run once at
// startup to tighten what already exists: the directory holding the wallets,
// its parent holding the databases and configs, and every file inside. Each
// step is best-effort - a wallet that cannot be re-moded is still a wallet.
const TightenWalletPermissions = async () => {
    await fs.chmod(path.dirname(Dir.DefaultPath), 0o700).catch(() => {})
    await fs.chmod(Dir.DefaultPath, 0o700).catch(() => {})
    let entries
    try {
        entries = await fs.readdir(Dir.DefaultPath, {withFileTypes: true})
    } catch (e) {
        return
    }
    await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) =>
        fs.chmod(path.join(Dir.DefaultPath, entry.name), 0o600).catch(() => {})))
}

// What the load screen needs to know about a name before it can offer anything:
// whether there is a wallet there, and whether opening it will need a password.
// Answered together because the screen has no use for one without the other, and
// asking twice means reading the file twice.
//
// Not existing means no wallet by that name yet, which the screen offers to
// create. A name that cannot resolve to a path at all is not that: answering
// "no wallet here" for it walks the user through type, seed, seed confirmation
// and password before the write is refused for a reason nothing has mentioned
// yet. That throws, as does a file that exists but cannot be read, and both are
// reported where the name is typed.
const WalletFileState = async (winId, walletName) => {
    const walletPath = ResolveWalletPath(winId, walletName)
    try {
        await fs.access(walletPath)
    } catch (e) {
        return {exists: false, encrypted: false}
    }
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    return {exists: true, encrypted: walletFile.IsEncrypted(contents)}
}

// Wrong guesses at a file's password, counted so guessing gets slower. scrypt
// prices a single guess, but nothing else priced the stream of them an IPC
// caller can produce; this is that limiter, and it lives here because this is
// the one place every password in the app is proven - unlock, exports,
// settings changes, and the spend prompt all arrive at ReadWallet.
//
// Every attempt that offers a password goes one at a time through a queue,
// each waiting out the current delay first - so a burst of parallel guesses
// buys nothing, it just lines up. From the very first attempt, not from the
// first recorded miss: a gate that opens on the recorded count would admit
// every guess fired before the first one finishes recording, which is exactly
// the burst an IPC caller can produce. A few misses are free, since a person
// mistyping is the common case; past those the wait doubles per miss, and the
// right password clears the slate. Only a read offering no password on a file
// with no misses on record skips the queue - there is no guess in that to
// meter, and it is the shape of every routine read of a passwordless wallet.
// Slower rather than refused: a lockout would need its own error for every
// screen to explain, and would let anything that can reach these channels
// lock the owner out of their own wallet at will.
const passwordMisses = new Map()

const FreeGuesses = 3
const MaxGuessDelayMs = 30000

const GuessDelayMs = (misses) => misses <= FreeGuesses ? 0 :
    Math.min(1000 * 2 ** (misses - FreeGuesses - 1), MaxGuessDelayMs)

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readWalletCounted = async (walletPath, password) => {
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    try {
        const read = await walletFile.DecodeContents(contents, password)
        passwordMisses.delete(walletPath)
        return read
    } catch (e) {
        if (e.message === WrongPassword) {
            passwordMisses.set(walletPath, (passwordMisses.get(walletPath) || 0) + 1)
        }
        throw e
    }
}

// Returns the decrypted wallet, or throws WrongPassword. Reports whether the
// file was encrypted so the caller knows if there is a password worth keeping
// for later writes, and which version it was written in so the caller can
// migrate it; the password itself never travels back toward the renderer.
const ReadWallet = async (walletPath, password) => {
    if (password === undefined && !passwordMisses.has(walletPath)) {
        return readWalletCounted(walletPath, password)
    }
    // Its own queue, not the file's write lock: a wallet being guessed at can
    // still be read and written by the windows that already hold it open. The
    // delay is read at the attempt's own turn, so each guess in a lined-up
    // burst pays for the misses of the ones ahead of it.
    return Serialize("guess:" + walletPath, async () => {
        await pause(GuessDelayMs(passwordMisses.get(walletPath) || 0))
        return readWalletCounted(walletPath, password)
    })
}

let writeCount = 0

// A new wallet must never land on a file that already exists. Choosing a file in
// the open dialog is permission to read that wallet, not to replace it, and a
// plain name is not permission to replace the wallet already using it. The load
// screen only offers create for a name with no file behind it, so a request that
// reaches an existing one did not come from that screen. The exclusive flag
// makes the check part of the write rather than a test before it.
const CreateWalletFile = async (walletPath, wallet, password) => {
    const encoded = await walletFile.EncodeWallet(wallet, password)
    await fs.writeFile(walletPath, encoded.contents, {flag: "wx", mode: 0o600})
    return encoded.integrityKey
}

// Writes through a temporary file so a reader never sees a half-written wallet:
// fs.writeFile truncates before it writes, and a torn read of a ciphertext looks
// exactly like a wrong password.
const WriteWallet = async (walletPath, wallet, password, integrityKey) => {
    const encoded = await walletFile.EncodeWallet(wallet, password, integrityKey)
    await writeContents(walletPath, encoded.contents)
    return encoded.integrityKey
}

// Applies an update to the public half alone, leaving the encrypted envelope
// exactly as it is. Main retains only the public-integrity key after unlock, so
// an address or setting can be updated and authenticated without the password
// and without decrypting the seed and imported keys.
const UpdatePublic = async (walletPath, integrityKey, apply) => {
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    const form = walletFile.ReadForm(contents)
    if (form.version !== walletFile.Version) {
        throw new Error("wallet file must be migrated before a public update")
    }
    const publicData = {...form.doc.public}
    apply(publicData)
    await writeContents(walletPath, walletFile.EncodePublic(form.doc, publicData, integrityKey))
    return publicData
}

const writeContents = async (walletPath, contents) => {
    // A unique scratch name so two writers can't clobber each other's temp file
    // even outside WithWalletLock.
    const tempPath = walletPath + "." + process.pid + "." + (writeCount++) + ".tmp"
    try {
        // The rename carries the scratch file's mode with it, so this is also
        // what fixes an old wallet's permissions on its next write.
        await fs.writeFile(tempPath, contents, {mode: 0o600})
        await fs.rename(tempPath, walletPath)
    } catch (e) {
        await fs.rm(tempPath, {force: true})
        throw e
    }
}

// Copies the file aside before it is rewritten in the new format. The exclusive
// flag means an existing backup is never written over, so the copy of the
// original wallet made by the first migration is the one that survives.
const backupWalletFile = async (walletPath, contents) => {
    for (let attempt = 0; ; attempt++) {
        const backupPath = walletPath + ".v1.bak" + (attempt ? "." + attempt : "")
        try {
            await fs.writeFile(backupPath, contents, {flag: "wx", mode: 0o600})
            return backupPath
        } catch (e) {
            if (e.code !== "EEXIST") {
                throw e
            }
        }
    }
}

// Rewrites a version 1 wallet in the current format. The original is copied
// aside first so a rewrite that fails cannot cost the wallet - but the copy
// does not outlive the migration. The old format is passphrase encryption over
// an MD5-derived key, which is what the migration exists to retire, and a copy
// of it kept beside the scrypt file leaves the seed exactly as guessable as it
// ever was for anyone who can read the directory. So the copy stays only until
// the rewritten file proves it decodes with the same password, and a failure
// anywhere before that leaves it in place as the way back.
//
// Migration happens on unlock, before anything can write to the file, so a
// wallet is only ever read in the old format and never written in it.
const MigrateWallet = async (walletPath, wallet, password) => {
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    const backupPath = await backupWalletFile(walletPath, contents)
    const integrityKey = await WriteWallet(walletPath, wallet, password)
    await ReadWallet(walletPath, password)
    await fs.rm(backupPath, {force: true})
    return {integrityKey}
}

// The copies left beside wallets by earlier releases, which kept them forever.
// They go once the current file has opened: decoding it with the password the
// user just supplied is what proves the copy holds nothing the wallet does
// not, and that its weaker encryption is a liability rather than a fallback.
// The match is exact about the shapes backupWalletFile writes, so a wallet
// somebody named to look similar is not swept up with them.
const removeStaleBackups = async (walletPath) => {
    const backupOf = path.basename(walletPath) + ".v1.bak"
    const dir = path.dirname(walletPath)
    let names
    try {
        names = await fs.readdir(dir)
    } catch (e) {
        return
    }
    const isBackup = (name) => name.startsWith(backupOf) &&
        (name.length === backupOf.length || /^\.\d+$/.test(name.slice(backupOf.length)))
    await Promise.all(names.filter(isBackup).map((name) =>
        fs.rm(path.join(dir, name), {force: true}).catch(() => {})))
}

// The preload did its read-modify-write with the synchronous fs calls, which
// blocked the renderer and so could never interleave. Doing the same work
// asynchronously in main can, and several components ask for the wallet at once
// when the wallet page mounts, so updates to one file are run one at a time.
// Prefixed so a file path can never share a queue with anything else serialized
// elsewhere in main.
const WithWalletLock = (walletPath, run) => Serialize("wallet:" + walletPath, run)

// Reading the legacy form and deciding whether to migrate must happen under the
// same lock as the rewrite. Otherwise two unlockers can both capture version 1,
// then the second can write that stale snapshot over changes made after the
// first migration.
const ReadAndMigrateWallet = (walletPath, password) =>
    WithWalletLock(walletPath, async () => {
        const read = await ReadWallet(walletPath, password)
        // The unlock path sees every wallet that matters, including ones the
        // user keeps outside the default directory, which the startup pass
        // never visits. Decoding proved this file is a wallet; make sure it is
        // readable by its owner alone.
        await fs.chmod(walletPath, 0o600).catch(() => {})
        const secretPassword = read.encrypted ? password : undefined
        if (read.version !== walletFile.Version) {
            const migrated = await MigrateWallet(walletPath, read.wallet, secretPassword)
            await removeStaleBackups(walletPath)
            return {...read, version: walletFile.Version, integrityKey: migrated.integrityKey}
        }
        await removeStaleBackups(walletPath)
        if (!read.publicSecrets) {
            return read
        }
        // A current-version file holding a field that now belongs inside the
        // envelope. Nothing about the wallet changes, only which half each field
        // is written in, so this needs no backup - unlike a version migration,
        // which changes the format the file is readable in at all.
        const integrityKey = await WriteWallet(
            walletPath, read.wallet, secretPassword, read.integrityKey)
        return {...read, integrityKey, publicSecrets: false}
    })

const NewWallet = (seedPhrase, keyList, addressList) => ({
    time: new Date(),
    seed: seedPhrase,
    keys: keyList,
    addresses: addressList,
})

// PasswordThreshold is how many satoshis may leave the wallet, in total, before
// the password is asked for again. Zero means every send is asked for, which is
// what a wallet gets until someone deliberately raises it. For a wallet with no
// password the same threshold meters an approval window instead: ConfirmSends
// decides whether such a wallet confirms its sends at all - on by default, and
// turning it off is the owner's deliberate choice, made in main's own window.
const DefaultSettings = {
    DirectTx: false,
    PasswordThreshold: 0,
    ConfirmSends: true,
}

const ThresholdSetting = "PasswordThreshold"
const ConfirmSetting = "ConfirmSends"

// What may cross to the renderer, and equally what may be written outside the
// envelope: the same fields walletFile keeps inside it are dropped here, so the
// public half of a file is never rebuilt from a wallet still carrying them.
const PublicWallet = (wallet) => {
    const {seed, keys, derivation, ...publicData} = wallet
    return {
        ...publicData,
        // Present even when empty, so nothing on the other side has to ask for a
        // list to be created before it can read one. Settings the same way: a
        // wallet whose file predates a setting reads as the default, rather than
        // having the renderer write one in before it can ask what it is.
        addresses: wallet.addresses || [],
        changeList: wallet.changeList || [],
        slpList: wallet.slpList || [],
        settings: {...DefaultSettings, ...wallet.settings},
        canSign: !!(seed || (keys && keys.length)),
        walletType: seed ? "seed" : (keys && keys.length ? "imported" : "watch"),
    }
}

// The nine near-identical mutators the preload used to carry, reduced to one
// table. Each op adds to or removes from a list field, de-duplicating as before.
//
// The change and SLP lists are not in the table: they are derived from the
// account keys in main, so nothing outside this process has a reason to append
// to them, and an op that exists is an op a compromised renderer can call.
const ListOps = {
    addAddresses: {field: "addresses", remove: false},
    removeAddresses: {field: "addresses", remove: true},
    addKeys: {field: "keys", remove: false},
    removeKeys: {field: "keys", remove: true},
}

// Whether an update reaches inside the encrypted envelope, which only the ones
// touching imported keys do. Derived from the table above so the two can't drift
// apart the way a restated list of op names would.
const UpdateTouchesSecret = (op) => {
    const listOp = ListOps[op]
    return !!listOp && walletFile.SecretFields.includes(listOp.field)
}

const ApplyWalletUpdate = (wallet, op, values) => {
    if (op === "changeSettings") {
        // The threshold decides when a spend may go through without the
        // password, so it is worth being certain of its shape: a string or an
        // Infinity here would be a policy nobody can reason about.
        const threshold = values && values[ThresholdSetting]
        if (threshold !== undefined &&
            (!Number.isSafeInteger(threshold) || threshold < 0)) {
            throw new Error("password threshold must be a whole number of satoshis")
        }
        // The same certainty for the confirmation switch: anything but a plain
        // boolean would make "is confirmation on" a judgment call.
        const confirm = values && values[ConfirmSetting]
        if (confirm !== undefined && typeof confirm !== "boolean") {
            throw new Error("send confirmation must be on or off")
        }
        wallet.settings = {...DefaultSettings, ...wallet.settings, ...values}
        return
    }
    const listOp = ListOps[op]
    if (!listOp) {
        throw new Error("unknown wallet update: " + op)
    }
    if (!Array.isArray(values)) {
        throw new Error("wallet update needs a list of values")
    }
    const current = wallet[listOp.field] || []
    wallet[listOp.field] = listOp.remove
        ? [...new Set(current.filter(value => !values.includes(value)))]
        : [...new Set([...current, ...values])]
}

module.exports = {
    AllowPath,
    ApplyWalletUpdate,
    CreateWalletFile,
    DefaultSettings,
    ForgetPaths,
    FreeGuesses,
    GuessDelayMs,
    IsWalletArtifact,
    ListWalletFiles,
    MigrateWallet,
    NewWallet,
    PublicWallet,
    ReadAndMigrateWallet,
    ReadWallet,
    ResolveWalletPath,
    ThresholdSetting,
    ConfirmSetting,
    TightenWalletPermissions,
    UpdatePublic,
    UpdateTouchesSecret,
    Version: walletFile.Version,
    WalletFileState,
    WithWalletLock,
    WriteWallet,
    WrongPassword,
}
