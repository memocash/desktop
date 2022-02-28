const {app, BrowserWindow, ipcMain, dialog, screen, Menu} = require('electron')
const homedir = require("os").homedir()
const path = require('path')
const prepareNext = require('electron-next')
const menu = require("./menu")
const {GraphQL} = require("./client/graphql");
const {SaveTransactions, GetTransactions, GetTransaction} = require("./data/txs");
const {GetCoins} = require("./data/outputs");

const wallets = {}
const windows = {}
const menus = {}
const txWindows = {}
let windowNumber = 0

const CreateWindow = async () => {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    let idOffset = 20 * windowNumber
    for (let i = 0; idOffset > currentScreen.bounds.height - 200 && i < 10; i++) {
        idOffset -= currentScreen.bounds.height - 200
    }
    const win = new BrowserWindow({
        x: currentScreenXValue + 200 + idOffset,
        y: 200 + idOffset,
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 300,
        title: "Memo",
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js")
        },
        icon: path.join(__dirname, "assets/memo-logo-small.icns"),
    })
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    windows[win.webContents.id] = win
    await win.loadURL("http://localhost:8000")
    windowNumber++
}

const CreateTxWindow = async (winId, {txHash, payTo, message, amount}) => {
    const win = new BrowserWindow({
        width: 650,
        height: 500,
        minWidth: 650,
        minHeight: 300,
        title: "Transaction",
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js"),
        },
        icon: path.join(__dirname, "assets/memo-logo-small.icns"),
    })
    if (txWindows[winId] === undefined) {
        txWindows[winId] = []
    }
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    txWindows[winId].push(win)
    windows[win.webContents.id] = win
    wallets[win.webContents.id] = wallets[winId]
    let params = {txHash}
    if (!txHash || !txHash.length) {
        params = {payTo, message, amount}
    }
    await win.loadURL("http://localhost:8000/tx?" + (new URLSearchParams(params)).toString())
}

app.whenReady().then(async () => {
    await prepareNext('./renderer')

    app.on("browser-window-focus", (e, win) => {
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(menus[win.webContents.id])
        }
    })

    ipcMain.handle("open-file-dialog", async (e) => {
        const win = windows[e.sender.id]
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: homedir + "/.memo/wallets"})
        if (canceled) {
            return ""
        }
        return filePaths[0]
    })

    ipcMain.on("show-message-dialog", (e, message) => {
        dialog.showMessageBoxSync(windows[e.sender.id], {
            title: "Memo",
            message: message,
        })
    })

    ipcMain.on("store-wallet", (e, wallet, filename, password) => {
        wallets[e.sender.id] = {wallet, filename, password}
    })

    ipcMain.handle("get-wallet", async (e) => {
        return wallets[e.sender.id]
    })

    ipcMain.handle("get-window-id", async (e) => {
        return e.sender.id
    })

    ipcMain.on("wallet-loaded", (e) => {
        menus[e.sender.id] = menu.ShowMenu(windows[e.sender.id], CreateWindow)
        const walletName = path.parse(wallets[e.sender.id].filename).name
        windows[e.sender.id].title = "Memo - " + walletName
    })

    ipcMain.handle("graphql", async (e, {query, variables}) => {
        return GraphQL({query, variables})
    })

    ipcMain.on("open-preview-send", async (e, {payTo, message, amount}) => {
        await CreateTxWindow(e.sender.id, {payTo, message, amount})
    })

    ipcMain.on("close-window", (e) => {
        windows[e.sender.id].close()
    })

    ipcMain.on("open-transaction", async (e, {txHash}) => {
        await CreateTxWindow(e.sender.id, {txHash})
    })

    ipcMain.on("save-transactions", async (e, transactions) => {
        await SaveTransactions(transactions)
    })

    ipcMain.handle("get-transactions", async (e, addresses) => {
        return GetTransactions(addresses)
    })

    ipcMain.handle("get-transaction", async (e, txHash) => {
        return GetTransaction(txHash)
    })

    ipcMain.handle("get-coins", async (e, addresses) => {
        return GetCoins(addresses)
    })

    await CreateWindow()
})
