const {ipcRenderer, clipboard, contextBridge} = require('electron')
const fs = require("fs/promises")
const path = require("path")
const homedir = require('os').homedir()
const CryptoJS = require("crypto-js")

const getPathForWallet = wallet => {
    wallet = wallet.trim()
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

const decryptWallet = (encryptedWallet, inputPassword) => {
    const bytes = CryptoJS.AES.decrypt(encryptedWallet, inputPassword)
    return bytes.toString(CryptoJS.enc.Utf8)
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
    decryptWallet,
    getWalletFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        return await fs.readFile(wallet, {encoding: "utf8"})
    },
    getWindowId: async () => {
        return await ipcRenderer.invoke("get-window-id")
    },
    openFileDialog: () => {
        ipcRenderer.send("open-file-dialog")
    },
    showMessageDialog: (message) => {
        ipcRenderer.send("show-message-dialog", message)
    },
    setWallet: async (wallet, filename, password) => {
        ipcRenderer.send("store-wallet", wallet, getPathForWallet(filename), password)
    },
    addAddresses: async (addressList) => {
        const {filename, password} = await ipcRenderer.invoke("get-wallet")
        let walletJson = await fs.readFile(filename, {encoding: "utf8"})
        if (password && password.length) {
            walletJson = decryptWallet(walletJson, password)
        }
        const wallet = JSON.parse(walletJson)
        if (!wallet.addresses) {
            wallet.addresses = []
        }
        wallet.addresses.push(...addressList)
        let contents = JSON.stringify(wallet)
        if (password && password.length) {
            contents = CryptoJS.AES.encrypt(contents, password).toString()
        }
        await fs.writeFile(filename, contents)
        await ipcRenderer.send("store-wallet", wallet, filename, password)
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
        await ipcRenderer.send("store-wallet", JSON.parse(wallet), filename, password)
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
        const {wallet} = await ipcRenderer.invoke("get-wallet")
        return wallet
    },
    listenAddedWallet: (handler) => {
        ipcRenderer.on("added-wallet", handler)
    },
    graphQL: async (query, variables) => {
        return await ipcRenderer.invoke("graphql", {query, variables})
    },
    openPreviewSend: async ({payTo, message, amount}) => {
        ipcRenderer.send("open-preview-send", {payTo, message, amount})
    },
    saveTransactions: async (transactions) => {
        await ipcRenderer.send("save-transactions", transactions)
    },
    getTransactions: async () => {
        return ipcRenderer.invoke("get-transactions")
    },
})
