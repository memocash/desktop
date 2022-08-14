const {ipcMain} = require("electron");
const path = require("path");
const {Handlers} = require("../../common/util");
const {GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
const {SetWallet, GetWallet, SetMenu, GetWindow, CreateWindow} = require("../window");

const WalletHandlers = () => {
    ipcMain.handle(Handlers.GetWallet, async (e) => GetWallet(e.sender.id))
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => GetWalletInfo(addresses))
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
