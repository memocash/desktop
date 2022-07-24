const {app, BrowserWindow, ipcMain, dialog, screen, Menu, MenuItem} = require('electron')
const path = require('path')
const prepareNext = require('electron-next')
const menu = require("./menu")
const {GraphQL, Subscribe} = require("./client/graphql");
const {
    SaveTransactions, GetTransactions, GetTransaction, GetRecentAddressTransactions,
    GetWalletInfo, GenerateHistory, SaveBlock, GetUtxos
} = require("./data/txs");
const {GetCoins} = require("./data/tables");
const {Dir, Modals} = require("../common/util")
const {
    GetProfileInfo, SaveMemoProfiles, GetRecentSetName, GetRecentSetProfile,
    GetRecentSetPic, GetPic
} = require("./data/memo");
const {SaveImagesFromProfiles} = require("./client/images");
const {GetFollowing} = require("./data/tables");

const wallets = {}
const windows = {}
const menus = {}
const txWindows = {}
const storage = {}
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

const CreateTxWindow = async (winId, {txHash, inputs, outputs, beatHash}) => {
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
        params = {inputs, outputs, beatHash}
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
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: Dir.DefaultPath})
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
        menus[e.sender.id] = menu.ShowMenu(windows[e.sender.id], CreateWindow, wallets[e.sender.id].wallet)
        const walletName = path.parse(wallets[e.sender.id].filename).name
        windows[e.sender.id].title = "Memo - " + walletName
    })
    ipcMain.handle("graphql", async (e, {query, variables}) => {
        return GraphQL({query, variables})
    })
    ipcMain.on("graphql-subscribe", (e, {id, query, variables}) => {
        const onopen = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-open-" + id, data)
        }
        const callback = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-data-" + id, data)
        }
        const onclose = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-close-" + id, data)
        }
        Subscribe({query, variables, callback, onopen, onclose})
    })
    ipcMain.on("open-preview-send", async (e, {inputs, outputs, beatHash}) => {
        await CreateTxWindow(e.sender.id, {inputs, outputs, beatHash})
    })
    ipcMain.on("close-window", (e) => {
        windows[e.sender.id].close()
    })
    ipcMain.on("open-transaction", async (e, {txHash}) => {
        await CreateTxWindow(e.sender.id, {txHash})
    })
    ipcMain.handle("save-transactions", async (e, transactions) => {
        await SaveTransactions(transactions)
    })
    ipcMain.handle("save-block", async (e, block) => {
        await SaveBlock(block)
    })
    ipcMain.handle("save-memo-profiles", async (e, profiles) => {
        await SaveImagesFromProfiles(profiles
            .concat(profiles.map(profile => profile.following.map(follow => follow.follow_lock.profile)).flat())
            .concat(profiles.map(profile => profile.followers.map(follow => follow.lock.profile))).flat())
        await SaveMemoProfiles(profiles)
    })
    ipcMain.handle("get-pic", async (e, url) => {
        return await GetPic(url)
    })
    ipcMain.handle("generate-history", async (e, addresses) => {
        await GenerateHistory(addresses)
    })
    ipcMain.handle("get-transactions", async (e, addresses) => {
        return GetTransactions(addresses)
    })
    ipcMain.handle("get-utxos", async (e, addresses) => {
        return GetUtxos(addresses)
    })
    ipcMain.handle("get-transaction", async (e, txHash) => {
        return GetTransaction(txHash)
    })
    ipcMain.handle("get-coins", async (e, addresses) => {
        return GetCoins(addresses)
    })
    ipcMain.handle("get-recent-addresses", async (e, addresses) => {
        return GetRecentAddressTransactions(addresses)
    })
    ipcMain.handle("get-wallet-info", async (e, addresses) => {
        return GetWalletInfo(addresses)
    })
    ipcMain.on("set-window-storage", (e, key, value) => {
        if (storage[e.sender.id] === undefined) {
            storage[e.sender.id] = {}
        }
        storage[e.sender.id][key] = value
    })
    ipcMain.handle("get-window-storage", (e, key) => {
        if (storage[e.sender.id] === undefined) {
            return undefined
        }
        return storage[e.sender.id][key]
    })
    ipcMain.handle("right-click-menu", (e) => {
        const win = windows[e.sender.id]
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Private Key",
            click: () => {
                win.webContents.send("display-modal", Modals.Key)
            },
        }))
        menu.popup({window: win})
    })
    ipcMain.handle("get-profile-info", async (e, addresses) => {
        return GetProfileInfo(addresses)
    })
    ipcMain.handle("get-recent-set-name", async (e, addresses) => {
        return GetRecentSetName(addresses)
    })
    ipcMain.handle("get-recent-set-profile", async (e, addresses) => {
        return GetRecentSetProfile(addresses)
    })
    ipcMain.handle("get-recent-set-pic", async (e, addresses) => {
        return GetRecentSetPic(addresses)
    })
    ipcMain.handle("get-following", async (e, addresses) => {
        return GetFollowing(addresses)
    })
    await CreateWindow()
})
