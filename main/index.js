const {app, ipcMain, dialog, Menu, MenuItem} = require('electron')
const path = require('path')
const prepareNext = require('electron-next')
const menu = require("./menu")
const {GraphQL, Subscribe} = require("./client/graphql");
const {
    SaveTransactions, GetTransactions, GetTransaction, GetRecentAddressTransactions,
    GetWalletInfo, GenerateHistory, SaveBlock, GetUtxos
} = require("./data/txs");
const {GetCoins, GetPosts} = require("./data/tables");
const {Dir, Modals} = require("../common/util")
const {
    GetProfileInfo, SaveMemoProfiles, GetRecentSetName, GetRecentSetProfile,
    GetRecentSetPic, GetPic
} = require("./data/memo");
const {SaveImagesFromProfiles} = require("./client/images");
const {GetFollowing} = require("./data/tables");
const {GetRecentFollow, GetFollowers} = require("./data/tables/memo_follow");
const {
    GetMenu, GetStorage, GetWindow, GetWallet, SetMenu, SetStorage, SetWallet,
    CreateTxWindow, CreateWindow
} = require("./app/window");
const {SetupProfileHandlers} = require("./app/profile");

app.whenReady().then(async () => {
    await prepareNext('./renderer')
    app.on("browser-window-focus", (e, win) => {
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(GetMenu(win.webContents.id))
        }
    })
    ipcMain.handle("open-file-dialog", async (e) => {
        const win = GetWindow(e.sender.id)
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: Dir.DefaultPath})
        if (canceled) {
            return ""
        }
        return filePaths[0]
    })
    ipcMain.on("show-message-dialog", (e, message) => {
        dialog.showMessageBoxSync(GetWindow(e.sender.id), {
            title: "Memo",
            message: message,
        })
    })
    ipcMain.on("store-wallet", (e, wallet, filename, password) => {
        SetWallet(e.sender.id, {wallet, filename, password})
    })
    ipcMain.handle("get-wallet", async (e) => {
        return GetWallet(e.sender.id)
    })
    ipcMain.handle("get-window-id", async (e) => {
        return e.sender.id
    })
    ipcMain.on("wallet-loaded", (e) => {
        SetMenu(e.sender.id, menu.ShowMenu(GetWindow(e.sender.id), CreateWindow, GetWallet(e.sender.id).wallet))
        const walletName = path.parse(GetWallet(e.sender.id).filename).name
        GetWindow(e.sender.id).title = "Memo - " + walletName
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
        GetWindow(e.sender.id).close()
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
            .concat(profiles.map(profile => profile.following ?
                profile.following.map(follow => follow.follow_lock.profile) : []).flat())
            .concat(profiles.map(profile => profile.followers ?
                profile.followers.map(follow => follow.lock.profile) : []).flat()))
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
        if (GetStorage(e.sender.id) === undefined) {
            SetStorage(e.sender.id, {})
        }
        GetStorage(e.sender.id)[key] = value
    })
    ipcMain.handle("get-window-storage", (e, key) => {
        if (GetStorage(e.sender.id) === undefined) {
            return undefined
        }
        return GetStorage(e.sender.id)[key]
    })
    ipcMain.handle("right-click-menu", (e) => {
        const win = GetWindow(e.sender.id)
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Private Key",
            click: () => {
                win.webContents.send("display-modal", Modals.Key)
            },
        }))
        menu.popup({window: win})
    })
    SetupProfileHandlers()
    await CreateWindow()
})
