const fs = require("fs/promises")
const path = require("path")
const CryptoJS = require("crypto-js")
const {Dir} = require("../common/util")

// Every wallet read, write, and decryption lives here rather than in the preload
// so the renderer never holds a file handle or a cipher. The renderer names a
// wallet; it never supplies a path this module hasn't already vouched for.

const WrongPassword = "wrong-password"

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

// An unencrypted wallet is stored as bare JSON, so a file that doesn't open with
// a brace is a CryptoJS payload. Phase 2 replaces this with a version field.
const isCiphertext = (contents) => !contents.trimStart().startsWith("{")

const decrypt = (contents, password) => {
    let text
    try {
        text = CryptoJS.AES.decrypt(contents, password).toString(CryptoJS.enc.Utf8)
    } catch (e) {
        // A wrong password usually surfaces as a UTF-8 decode failure.
        throw new Error(WrongPassword)
    }
    if (!text.startsWith("{")) {
        throw new Error(WrongPassword)
    }
    return text
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
    return isCiphertext(contents)
}

// Returns the decrypted wallet, or throws WrongPassword. Reports whether the
// file was encrypted so the caller knows if there is a password worth keeping
// for later writes; the password itself never travels back toward the renderer.
const ReadWallet = async (walletPath, password) => {
    let contents = await fs.readFile(walletPath, {encoding: "utf8"})
    const encrypted = isCiphertext(contents)
    if (encrypted) {
        if (!password || !password.length) {
            throw new Error(WrongPassword)
        }
        contents = decrypt(contents, password)
    }
    return {wallet: JSON.parse(contents), encrypted}
}

let writeCount = 0

const encode = (wallet, password) => {
    const contents = JSON.stringify(wallet)
    if (password && password.length) {
        return CryptoJS.AES.encrypt(contents, password).toString()
    }
    return contents
}

// A new wallet must never land on a file that already exists. Choosing a file in
// the open dialog is permission to read that wallet, not to replace it, and a
// plain name is not permission to replace the wallet already using it. The load
// screen only offers create for a name with no file behind it, so a request that
// reaches an existing one did not come from that screen. The exclusive flag
// makes the check part of the write rather than a test before it.
const CreateWalletFile = async (walletPath, wallet, password) => {
    await fs.writeFile(walletPath, encode(wallet, password), {flag: "wx"})
}

// Writes through a temporary file so a reader never sees a half-written wallet:
// fs.writeFile truncates before it writes, and a torn read of a ciphertext looks
// exactly like a wrong password.
const WriteWallet = async (walletPath, wallet, password) => {
    const contents = encode(wallet, password)
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

const NewWallet = (seedPhrase, keyList, addressList) => ({
    time: new Date(),
    seed: seedPhrase,
    keys: keyList,
    addresses: addressList,
})

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
    NewWallet,
    ReadWallet,
    ResolveWalletPath,
    WalletFileExists,
    WalletFileIsEncrypted,
    WithWalletLock,
    WriteWallet,
    WrongPassword,
}
