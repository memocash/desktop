const {ipcRenderer, clipboard, contextBridge} = require('electron')
const myElectron = require('electron')
const fs = require("fs/promises")
const homedir = require('os').homedir()

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
    listenFile: (handler) => {
        ipcRenderer.on("listenFile", handler)
    },
    getFile: async (walletName) => {
        return await fs.readFile(homedir + "/.memo/wallets/" + walletName + ".json", { encoding: "utf8"})
    },
    openDialog: () => {
        ipcRenderer.send("open-dialog")
    },
    createFile: async (walletName) => {
        await fs.mkdir(homedir + "/.memo/wallets", {recursive: true})
        fs.writeFile(homedir + "/.memo/wallets/" + walletName + ".json", JSON.stringify({ time: new Date() }))
    },
    checkFile: async (walletName) => {
        try {
            await fs.access(homedir + "/.memo/wallets/"+walletName +".json")
        } catch(err) {
            return false
        }
        return true
    },
    clearClipboard: () => clipboard.clear(),
})
