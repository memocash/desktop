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

const CreateWindow = async () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, "preload.js")
        },
        icon: path.join(__dirname, "assets/memo-logo-small.icns"),
    })
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    windows[win.webContents.id] = win
    // open app on screen where cursor is
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    const boundsObject = {x: currentScreenXValue + 200, y: 200, width: 800, height: 600}
    win.setBounds(boundsObject)
    await win.loadURL("http://localhost:8000")
}

const CreateTxWindow = async (winId) => {
    const win = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, "preload-preview.js"),
        },
        icon: path.join(__dirname, "assets/memo-logo-small.icns"),
    })
    if (txWindows[winId] === undefined) {
        txWindows[winId] = []
    }
    menus[win.webContents.id] = menu.SimpleMenu(win, false)
    txWindows[winId].push(win)
    await win.loadURL("http://localhost:8000/tx")
}

app.whenReady().then(async () => {
    await prepareNext('./renderer')

    app.on("browser-window-focus", (e, win) => {
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(menus[win.webContents.id])
        }
    })

    ipcMain.on("open-dialog", async (e) => {
        const win = windows[e.sender.id]
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: homedir + "/.memo/wallets"})
        if (!canceled) {
            win.webContents.send("listenFile", filePaths[0])
        }
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

    ipcMain.on("open-preview-send", async (e) => {
        await CreateTxWindow(e.sender.id)
    })

    await CreateWindow()
})
