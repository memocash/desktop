const {app, BrowserWindow, ipcMain, dialog} = require('electron')
const path = require('path')
//const isDev = require('electron-is-dev')
const prepareNext = require('electron-next')

app.whenReady().then(async () => {
    await prepareNext('./renderer')
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    })
    await win.loadURL("http://localhost:8000")
    /*if (isDev) {
        win.webContents.openDevTools({mode: 'detach'});
    }*/

    // open app where on screen where cursor is
    // const { screen } = require("electron")
    // const { getCursorScreenPoint, getDisplayNearestPoint } = screen
    // const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    // win.setBounds(currentScreen.workArea)

    console.log(win.webContents)
    ipcMain.on("open-dialog", async () => {
        const { filePaths } = await dialog.showOpenDialog(win)
        win.webContents.send('channel', filePaths[0])
    })
})
