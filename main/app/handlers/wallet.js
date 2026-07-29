const {ipcMain} = require("electron");
const fs = require("fs/promises");
const path = require("path");
const {Worker} = require("worker_threads");
const {Dir, Handlers} = require("../../common/util");
const {GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
const keystore = require("../keystore");
const {SetWallet, GetWallet, SetMenu, GetWindow, CreateWindow, eConf} = require("../window");

// Runs key/address derivation in a worker thread so the CPU-intensive
// secp256k1 work never blocks the main process or the renderer UI. The worker
// derives everything from the seed in one pass and posts back a single result.
const generateWallet = (seed, keys) => new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, "addressWorker.js"), {
        workerData: {seed, keys},
    })
    worker.once("message", (msg) => {
        worker.terminate()
        if (msg.error) {
            reject(new Error(msg.error))
        } else {
            resolve(msg.result)
        }
    })
    worker.once("error", reject)
    worker.once("exit", (code) => {
        if (code !== 0) {
            reject(new Error("Address worker stopped with exit code " + code))
        }
    })
})

// The renderer used to decrypt the file itself and hand the plaintext wallet and
// password back through an ipcMain.on, which left it in charge of what main
// trusted. Now it only names a wallet and offers a password, and finds out
// whether that worked.
const unlockWallet = async (winId, walletName, password) => {
    const filename = keystore.ResolveWalletPath(winId, walletName)
    let read
    try {
        read = await keystore.ReadAndMigrateWallet(filename, password)
    } catch (e) {
        if (e.message === keystore.WrongPassword) {
            return {error: keystore.WrongPassword}
        }
        throw e
    }
    SetWallet(winId, {
        wallet: read.wallet,
        filename,
        encrypted: read.encrypted,
        integrityKey: read.integrityKey,
    })
    return {ok: true}
}

const createWallet = async (winId, walletName, seedPhrase, keyList, addressList, password) => {
    if (!Dir.IsFullPath(walletName)) {
        await fs.mkdir(Dir.DefaultPath, {recursive: true})
    }
    const filename = keystore.ResolveWalletPath(winId, walletName)
    const wallet = keystore.NewWallet(seedPhrase, keyList, addressList)
    try {
        const integrityKey = await keystore.CreateWalletFile(filename, wallet, password)
        SetWallet(winId, {wallet, filename, encrypted: !!(password && password.length), integrityKey})
    } catch (e) {
        if (e.code === "EEXIST") {
            return {error: "wallet-exists"}
        }
        throw e
    }
    return {ok: true}
}

// Re-reads from disk before mutating, the way the preload versions did, so two
// windows open on the same file don't overwrite each other's lists. The whole
// read-modify-write holds the file's lock, since the wallet page fires several
// of these at once as it mounts.
//
// An update that only touches public metadata - which is all of them except the
// imported keys - rewrites the public half and leaves the encrypted envelope
// alone, so the common case never decrypts anything.
const updateWallet = async (winId, op, values, password) => {
    const {filename, encrypted, integrityKey} = GetWallet(winId)
    await keystore.WithWalletLock(filename, async () => {
        if (keystore.UpdateTouchesSecret(op)) {
            const {wallet: stored} = await keystore.ReadWallet(
                filename, encrypted ? password : undefined)
            keystore.ApplyWalletUpdate(stored, op, values)
            await keystore.WriteWallet(
                filename, stored, encrypted ? password : undefined, integrityKey)
            SetWallet(winId, {wallet: stored, filename, encrypted, integrityKey})
            return
        }
        const publicData = await keystore.UpdatePublic(filename, integrityKey, (data) =>
            keystore.ApplyWalletUpdate(data, op, values))
        // Read the held wallet inside the lock: a key update queued ahead of
        // this one would make a snapshot taken outside it stale, and merging
        // over that would put the old keys back.
        const {wallet} = GetWallet(winId)
        SetWallet(winId, {wallet: {...wallet, ...publicData}, filename, encrypted, integrityKey})
    })
}

const readForOperation = async (winId, password) => {
    const {filename, encrypted} = GetWallet(winId)
    return keystore.ReadWallet(filename, encrypted ? password : undefined)
}

const operationResult = async (run) => {
    try {
        return {ok: true, value: await run()}
    } catch (e) {
        if (e.message === keystore.WrongPassword) {
            return {error: keystore.WrongPassword}
        }
        throw e
    }
}

const exportPrivateKey = async (winId, address, password) => {
    const {wallet} = await readForOperation(winId, password)
    const derived = await generateWallet(wallet.seed, wallet.keys)
    let index = derived.addresses.indexOf(address)
    if (index !== -1) {
        if (index < derived.keys.length) {
            return derived.keys[index]
        }
        return wallet.keys[index - derived.keys.length]
    }
    index = derived.changeList.indexOf(address)
    if (index !== -1) {
        return derived.changeKeys[index]
    }
    index = derived.slpList.indexOf(address)
    if (index !== -1) {
        return derived.slpKeys[index]
    }
    const publicAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
    if (publicAddresses.includes(address)) {
        return undefined
    }
    throw new Error("address not found in wallet")
}

const readNetworkConfig = async () => {
    try {
        return JSON.parse(await fs.readFile(Dir.NetworkConfigFile, {encoding: "utf8"}))
    } catch (e) {
        return undefined
    }
}

const WalletHandlers = () => {
    ipcMain.handle(Handlers.GetWallet, async (e) => GetWallet(e.sender.id))
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => GetWalletInfo(eConf(e), addresses))
    ipcMain.handle(Handlers.GenerateWallet, async (e, seed, keys) => {
        const {addresses, changeList, keys: derivedKeys, slpList} = await generateWallet(seed, keys)
        // The extra change/SLP WIFs are generated only for main-process export
        // and must not expand the renderer-facing derivation response.
        return {addresses, changeList, keys: derivedKeys, slpList}
    })
    ipcMain.handle(Handlers.AuthenticateWallet, async (e, password) =>
        operationResult(async () => {
            await readForOperation(e.sender.id, password)
        }))
    ipcMain.handle(Handlers.ExportSeed, async (e, password) =>
        operationResult(async () => (await readForOperation(e.sender.id, password)).wallet.seed))
    ipcMain.handle(Handlers.ExportPrivateKey, async (e, address, password) =>
        operationResult(() => exportPrivateKey(e.sender.id, address, password)))
    ipcMain.handle(Handlers.CheckWalletFile, async (e, walletName) =>
        keystore.WalletFileExists(e.sender.id, walletName))
    ipcMain.handle(Handlers.GetExistingWalletFiles, async () => keystore.ListWalletFiles())
    ipcMain.handle(Handlers.WalletFileIsEncrypted, async (e, walletName) =>
        keystore.WalletFileIsEncrypted(e.sender.id, walletName))
    ipcMain.handle(Handlers.UnlockWallet, async (e, walletName, password) =>
        unlockWallet(e.sender.id, walletName, password))
    ipcMain.handle(Handlers.CreateWallet, async (e, walletName, seedPhrase, keyList, addressList, password) =>
        createWallet(e.sender.id, walletName, seedPhrase, keyList, addressList, password))
    ipcMain.handle(Handlers.UpdateWallet, async (e, op, values, password) =>
        operationResult(async () => {
            await updateWallet(e.sender.id, op, values, password)
        }))
    ipcMain.handle(Handlers.GetWalletFileInfo, async (e) => {
        const {filename, encrypted} = GetWallet(e.sender.id)
        return {filename, name: path.parse(filename).name, encrypted}
    })
    ipcMain.handle(Handlers.GetNetworkConfig, async () => readNetworkConfig())
    ipcMain.handle(Handlers.SaveNetworkConfig, async (e, networkConfig) => {
        await fs.writeFile(Dir.NetworkConfigFile, JSON.stringify(networkConfig, null, 2) + "\n")
    })
    ipcMain.on(Handlers.WalletLoaded, (e) => {
        SetMenu(e.sender.id, menu.ShowMenu(GetWindow(e.sender.id), CreateWindow, GetWallet(e.sender.id).wallet))
        const walletName = path.parse(GetWallet(e.sender.id).filename).name
        GetWindow(e.sender.id).title = "Memo - " + walletName
    })
}

module.exports = {
    WalletHandlers: WalletHandlers,
}
