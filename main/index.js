const {app, BrowserWindow} = require('electron')
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
})
