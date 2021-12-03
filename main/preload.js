const {ipcRenderer, clipboard, contextBridge} = require('electron')
const fs = require("fs/promises")
const path = require("path")
const homedir = require('os').homedir()
const CryptoJS = require("crypto-js")

const getPathForWallet = wallet => {
    if (!wallet.startsWith("/")) {
        wallet = homedir + "/.memo/wallets/" + wallet + ".json"
    }
    return wallet
}

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
    getPathForWallet,
    listenFile: (handler) => {
        ipcRenderer.on("listenFile", handler)
    },
    getExistingWalletFiles: async () => {
        const files = await fs.readdir(homedir + "/.memo/wallets")
        const fileNames = files.map(file => {
            return path.parse(file).name
        })
        return fileNames
    },
    getWalletFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        return await fs.readFile(wallet, {encoding: "utf8"})
    },
    openDialog: () => {
        ipcRenderer.send("open-dialog")
    },
    createFile: async (walletName, seedPhrase, password) => {
        if (!walletName.startsWith("/")) {
            await fs.mkdir(homedir + "/.memo/wallets", {recursive: true})
        }
        const wallet = getPathForWallet(walletName)
        let obj = {
            time: new Date(),
            seed: seedPhrase,
        }
        let contents = JSON.stringify(obj)
        if (password) {
            contents = CryptoJS.AES.encrypt(contents, password).toString()
        }
        await fs.writeFile(wallet, contents)
    },
    checkFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        try {
            await fs.access(wallet)
            return true
        } catch (err) {
            return false
        }
    },
    clearClipboard: () => clipboard.clear(),
})
