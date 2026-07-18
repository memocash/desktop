const {ipcMain} = require("electron");
const path = require("path");
const {Worker} = require("worker_threads");
const {Handlers} = require("../../common/util");
const {GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
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

const WalletHandlers = () => {
    ipcMain.handle(Handlers.GetWallet, async (e) => GetWallet(e.sender.id))
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => GetWalletInfo(eConf(e), addresses))
    ipcMain.handle(Handlers.GenerateWallet, async (e, seed, keys) => generateWallet(seed, keys))
    ipcMain.on(Handlers.StoreWallet, (e, wallet, filename, password) => {
        SetWallet(e.sender.id, {wallet, filename, password})
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
