const {ipcRenderer, clipboard, contextBridge} = require('electron')
const fs = require("fs/promises")
const path = require("path")
const homedir = require('os').homedir()
const CryptoJS = require("crypto-js")

const getPathForWallet = wallet => {
    if (!wallet.startsWith("/")) {
        wallet = homedir + "/.memo/wallets/" + wallet
    }
    return wallet
}

const getWalletShort = wallet => {
    if (wallet.startsWith(homedir + "/.memo/wallets/")) {
        return wallet.slice((homedir + "/.memo/wallets/").length)
    }
    return wallet
}

contextBridge.exposeInMainWorld('electron', {
    getPathForWallet,
    getWalletShort,
    listenFile: (handler) => {
        ipcRenderer.on("listenFile", handler)
    },
    walletLoaded: () => {
        ipcRenderer.send("wallet-loaded")
    },
    getExistingWalletFiles: async () => {
        const files = await fs.readdir(homedir + "/.memo/wallets")
        return files.map(file => {
            return path.parse(file).name
        })
    },
    getWalletFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        return await fs.readFile(wallet, {encoding: "utf8"})
    },
    getWindowId: async () => {
        return await ipcRenderer.invoke("get-window-id")
    },
    openDialog: () => {
        ipcRenderer.send("open-dialog")
    },
    setWallet: async (wallet) => {
        ipcRenderer.send("store-wallet", wallet)
    },
    createFile: async (walletName, seedPhrase, keyList, addressList, password) => {
        if (!walletName.startsWith("/")) {
            await fs.mkdir(homedir + "/.memo/wallets", {recursive: true})
        }
        const filename = getPathForWallet(walletName)
        let wallet = JSON.stringify({
            time: new Date(),
            seed: seedPhrase,
            keys: keyList,
            addresses: addressList,
        })
        let contents = wallet
        if (password) {
            contents = CryptoJS.AES.encrypt(contents, password).toString()
        }
        await fs.writeFile(filename, contents)
        await ipcRenderer.send("store-wallet", JSON.parse(wallet))
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
    getWallet: async () => {
        return await ipcRenderer.invoke("get-wallet")
    },
    listenAddedWallet: (handler) => {
        ipcRenderer.on("added-wallet", handler)
    },
    graphQL: async (query, variables) => {
        return await ipcRenderer.invoke("graphql", {query, variables})
    },
})
