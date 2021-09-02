const { app, BrowserWindow } = require('electron')
const path = require('path')
const isDev = require('electron-is-dev')

function createWindow () {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })

    win.loadFile('index.html')

    if (isDev) {
        win.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(() => {
    createWindow()
})
