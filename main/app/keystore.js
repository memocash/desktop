const fs = require("fs/promises")
const path = require("path")
const {Dir} = require("../common/util")
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

const ListWalletFiles = async () => {
    await fs.mkdir(Dir.DefaultPath, {recursive: true})
    const files = await fs.readdir(Dir.DefaultPath)
    return files.map(file => path.parse(file).name)
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
const walletQueues = new Map()

const WithWalletLock = (walletPath, run) => {
    const previous = walletQueues.get(walletPath) || Promise.resolve()
    const next = previous.then(run, run)
    walletQueues.set(walletPath, next.catch(() => {}))
    return next
}

// Reading the legacy form and deciding whether to migrate must happen under the
// same lock as the rewrite. Otherwise two unlockers can both capture version 1,
// then the second can write that stale snapshot over changes made after the
// first migration.
const ReadAndMigrateWallet = (walletPath, password) =>
    WithWalletLock(walletPath, async () => {
        const read = await ReadWallet(walletPath, password)
        if (read.version === walletFile.Version) {
            return read
        }
        const migrated = await MigrateWallet(
            walletPath, read.wallet, read.encrypted ? password : undefined)
        return {...read, version: walletFile.Version, integrityKey: migrated.integrityKey}
    })

const NewWallet = (seedPhrase, keyList, addressList) => ({
    time: new Date(),
    seed: seedPhrase,
    keys: keyList,
    addresses: addressList,
})

const PublicWallet = (wallet) => {
    const {seed, keys, ...publicData} = wallet
    return {
        ...publicData,
        canSign: !!(seed || (keys && keys.length)),
        walletType: seed ? "seed" : (keys && keys.length ? "imported" : "watch"),
    }
}

const DefaultSettings = {
    DirectTx: false,
    SkipPassword: true,
}

// The nine near-identical mutators the preload used to carry, reduced to one
// table. Each op adds to or removes from a list field, de-duplicating as before.
const ListOps = {
    addAddresses: {field: "addresses", remove: false},
    removeAddresses: {field: "addresses", remove: true},
    addKeys: {field: "keys", remove: false},
    removeKeys: {field: "keys", remove: true},
    addChangeList: {field: "changeList", remove: false},
    addSlpList: {field: "slpList", remove: false},
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
    UpdatePublic,
    UpdateTouchesSecret,
    Version: walletFile.Version,
    WalletFileExists,
    WalletFileIsEncrypted,
    WithWalletLock,
    WriteWallet,
    WrongPassword,
}
