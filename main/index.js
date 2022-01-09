const {app, BrowserWindow, ipcMain, dialog, screen} = require('electron')
const homedir = require("os").homedir()
const path = require('path')
const prepareNext = require('electron-next')
const menu = require("./menu")

const wallets = [];

let windows = {}

const CreateWindow = async () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    })
    menu.NoMenu(win)
    windows[win.id] = win
    // open app on screen where cursor is
    const {screen} = require("electron")
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    const boundsObject = {x: currentScreenXValue + 200, y: 200, width: 800, height: 600}
    win.setBounds(boundsObject)

    await win.loadURL("http://localhost:8000")
}

app.whenReady().then(async () => {
    await prepareNext('./renderer')
    await CreateWindow()

    ipcMain.on("open-dialog", async (e) => {
        const win = windows[e.sender.id]
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: homedir + "/.memo/wallets"})
        if (!canceled) {
            win.webContents.send("listenFile", filePaths[0])
        }
    })

    ipcMain.on("store-wallet", (event, walletInfo) => {
        wallets.push(walletInfo)
    })

    ipcMain.on("get-wallet", (e) => {
        windows[e.sender.id].webContents.send("added-wallet", wallets[0])
    })

    ipcMain.on("wallet-loaded", (e) => {
        menu.ShowMenu(windows[e.sender.id], () => {
            CreateWindow()
        })
    })
})
