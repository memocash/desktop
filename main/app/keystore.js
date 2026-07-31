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

// Wallets are written under a bare name with no extension, so anything carrying
// one is something the app left beside them: the .v1.bak a migration keeps, or a
// .<pid>.<n>.tmp a crash stranded mid-write. Listing those offered
// "default_wallet.v1" as a wallet, which is not one.
const ListWalletFiles = async () => {
    await fs.mkdir(Dir.DefaultPath, {recursive: true})
    const files = await fs.readdir(Dir.DefaultPath)
    return files.filter(file => !path.parse(file).ext)
}

const WalletFileExists = async (winId, walletName) => {
    try {
        await fs.access(ResolveWalletPath(winId, walletName))
        return true
    } catch (e) {
        return false
    }
}

const WalletFileIsEncrypted = async (winId, walletName) => {
    const contents = await fs.readFile(ResolveWalletPath(winId, walletName), {encoding: "utf8"})
    return walletFile.IsEncrypted(contents)
}

// Returns the decrypted wallet, or throws WrongPassword. Reports whether the
// file was encrypted so the caller knows if there is a password worth keeping
// for later writes, and which version it was written in so the caller can
// migrate it; the password itself never travels back toward the renderer.
const ReadWallet = async (walletPath, password) => {
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    return walletFile.DecodeContents(contents, password)
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
    await fs.writeFile(walletPath, encoded.contents, {flag: "wx"})
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
        await fs.writeFile(tempPath, contents)
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
            await fs.writeFile(backupPath, contents, {flag: "wx"})
            return backupPath
        } catch (e) {
            if (e.code !== "EEXIST") {
                throw e
            }
        }
    }
}

// Rewrites a version 1 wallet in the current format, keeping a copy of the
// original first. Migration happens on unlock, before anything can write to the
// file, so a wallet is only ever read in the old format and never written in it.
const MigrateWallet = async (walletPath, wallet, password) => {
    const contents = await fs.readFile(walletPath, {encoding: "utf8"})
    const backupPath = await backupWalletFile(walletPath, contents)
    const integrityKey = await WriteWallet(walletPath, wallet, password)
    return {backupPath, integrityKey}
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
        const secretPassword = read.encrypted ? password : undefined
        if (read.version !== walletFile.Version) {
            const migrated = await MigrateWallet(walletPath, read.wallet, secretPassword)
            return {...read, version: walletFile.Version, integrityKey: migrated.integrityKey}
        }
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

// What may cross to the renderer, and equally what may be written outside the
// envelope: the same fields walletFile keeps inside it are dropped here, so the
// public half of a file is never rebuilt from a wallet still carrying them.
const PublicWallet = (wallet) => {
    const {seed, keys, derivation, ...publicData} = wallet
    return {
        ...publicData,
        // Present even when empty, so nothing on the other side has to ask for a
        // list to be created before it can read one.
        addresses: wallet.addresses || [],
        changeList: wallet.changeList || [],
        slpList: wallet.slpList || [],
        canSign: !!(seed || (keys && keys.length)),
        walletType: seed ? "seed" : (keys && keys.length ? "imported" : "watch"),
    }
}

// PasswordThreshold is how many satoshis may leave the wallet, in total, before
// the password is asked for again. Zero means every send is asked for, which is
// what a wallet gets until someone deliberately raises it.
const DefaultSettings = {
    DirectTx: false,
    PasswordThreshold: 0,
}

const ThresholdSetting = "PasswordThreshold"

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
    ForgetPaths,
    ListWalletFiles,
    MigrateWallet,
    NewWallet,
    PublicWallet,
    ReadAndMigrateWallet,
    ReadWallet,
    ResolveWalletPath,
    ThresholdSetting,
    UpdatePublic,
    UpdateTouchesSecret,
    Version: walletFile.Version,
    WalletFileExists,
    WalletFileIsEncrypted,
    WithWalletLock,
    WriteWallet,
    WrongPassword,
}
