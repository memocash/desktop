const database = require("better-sqlite3")
const {app, BrowserWindow, ipcMain, dialog, screen, Menu} = require('electron')
const homedir = require("os").homedir()
const path = require('path')
const http = require('http')
const prepareNext = require('electron-next')
const menu = require("./menu")

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

const CreateTxWindow = async (winId, {payTo, message, amount}) => {
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
    await win.loadURL("http://localhost:8000/tx?" + (new URLSearchParams({payTo, message, amount})).toString())
}

app.whenReady().then(async () => {
    await prepareNext('./renderer')

    app.on("browser-window-focus", (e, win) => {
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(menus[win.webContents.id])
        }
    })

    ipcMain.on("open-file-dialog", async (e) => {
        const win = windows[e.sender.id]
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: homedir + "/.memo/wallets"})
        if (!canceled) {
            win.webContents.send("listenFile", filePaths[0])
        }
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
    })

    ipcMain.handle("graphql", async (e, {query, variables}) => {
        const body = JSON.stringify({
            query: query,
            variables: variables,
        })
        return new Promise((resolve, reject) => {
            const request = http.request("http://127.0.0.1:26770/graphql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": body.length,
                },
            }, (res) => {
                let data = "";
                res.on("data", d => {
                    data += d
                })
                res.on("end", () => {
                    try {
                        const jsonData = JSON.parse(data)
                        resolve(jsonData)
                    } catch (e) {
                        console.log("error parsing json response", e)
                        reject(e)
                    }
                })
            })
            request.on("error", error => {
                console.log("got error")
                reject(error)
            })
            request.write(body)
            request.end()
        })
    })

    ipcMain.on("open-preview-send", async (e, {payTo, message, amount}) => {
        await CreateTxWindow(e.sender.id, {payTo, message, amount})
    })

    ipcMain.on("save-transactions", async (e, transactions) => {
        const db = database("memo.db")
        const create = db.prepare("CREATE TABLE IF NOT EXISTS txs (hash CHAR)")
        create.run()
        for (let i = 0; i < transactions.length; i++) {
            const insert = db.prepare("INSERT INTO txs (hash) VALUES (?)")
            insert.run(transactions[i].hash)
        }
    })

    await CreateWindow()
})
