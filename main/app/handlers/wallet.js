const {ipcMain} = require("electron");
const path = require("path");
const {Handlers} = require("../../common/util");
const {GetWalletInfo} = require("../../data/txs");
const menu = require("../../menu");
const {SetWallet, GetWallet, SetMenu, GetWindow, CreateWindow} = require("../window");

const WalletHandlers = () => {
    ipcMain.on(Handlers.StoreWallet, (e, wallet, filename, password) => {
        SetWallet(e.sender.id, {wallet, filename, password})
    })
    ipcMain.handle(Handlers.GetWallet, async (e) => {
        return GetWallet(e.sender.id)
    })
    ipcMain.on(Handlers.WalletLoaded, (e) => {
        SetMenu(e.sender.id, menu.ShowMenu(GetWindow(e.sender.id), CreateWindow, GetWallet(e.sender.id).wallet))
        const walletName = path.parse(GetWallet(e.sender.id).filename).name
        GetWindow(e.sender.id).title = "Memo - " + walletName
    })
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => {
        return GetWalletInfo(addresses)
    })
}

module.exports = {
    WalletHandlers: WalletHandlers,
}
