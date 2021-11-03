const {ipcRenderer, contextBridge} = require('electron')
const myElectron = require('electron')
const fs = require("fs/promises")
const homedir = require('os').homedir()

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
    getFile: async () => {
        return await fs.readFile(homedir + "/.memo/wallets/myWallet.json", { encoding: "utf8"})
    },
    openDialog: () => {
        console.log(fs)
        // dialog.showOpenDialog(window)
        ipcRenderer.send("open-dialog")
    },
    createFile: async () => {
        await fs.mkdir(homedir + "/.memo/wallets", {recursive: true})
        fs.writeFile(homedir + "/.memo/wallets/" + "myWallet.json", JSON.stringify({ time: new Date() }))
    },
})

myElectron.ipcRenderer.on("channel", (e, result) => {
    console.log(result)
})
