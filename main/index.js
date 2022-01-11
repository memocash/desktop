const {app, BrowserWindow, ipcMain, dialog, screen, Menu} = require('electron')
const homedir = require("os").homedir()
const path = require('path')
const prepareNext = require('electron-next')
const menu = require("./menu")

const wallets = {}
const windows = {}
const menus = {}

const CreateWindow = async () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    })
    menus[win.webContents.id] = menu.NoMenu(win)
    windows[win.webContents.id] = win
    // open app on screen where cursor is
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    const boundsObject = {x: currentScreenXValue + 200, y: 200, width: 800, height: 600}
    win.setBounds(boundsObject)
    await win.loadURL("http://localhost:8000")
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

    ipcMain.on("store-wallet", (e, wallet) => {
        wallets[e.sender.id] = wallet
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
        const server = "http://127.0.0.1:26770"
        return new Promise((resolve, reject) => {
            fetch(server + "/graphql", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    query: query,
                    variables: variables,
                })
            }).then(res => res.json()).then(data => {
                resolve(data)
            }).catch(error => {
                reject(error)
            })
        })
    })

    await CreateWindow()
})
