const {ipcMain} = require("electron");
const path = require("path");
const {Handlers, Listeners} = require("../../common/util");
const {GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
const {SetWallet, GetWallet, SetMenu, GetWindow, CreateWindow, eConf} = require("../window");
const {Worker} = require("worker_threads");

const WalletHandlers = () => {
    ipcMain.handle(Handlers.GetWallet, async (e) => GetWallet(e.sender.id))
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => GetWalletInfo(eConf(e), addresses))
    ipcMain.on(Handlers.GenerateAddresses,  (e, seedPhrase) => {
        let w = new Worker(path.resolve(__dirname,"addressGenerator.js"))
        w.postMessage(seedPhrase)
        w.on("message", (e) => {
            console.log(e.data)
            e.sender.send(Listeners.AddressGenerated, e.data)
            //addressList.push(e.data)
        })
    })
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
