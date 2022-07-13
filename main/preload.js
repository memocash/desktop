const {ipcRenderer, clipboard, contextBridge} = require('electron')
const fs = require("fs/promises")
const path = require("path")
const CryptoJS = require("crypto-js")
const {GetId} = require("../common/util/id");
const {Dir} = require("../common/util");

const getPathForWallet = wallet => {
    wallet = wallet.trim()
    if (!Dir.IsFullPath(wallet)) {
        wallet = Dir.DefaultPath + path.sep + wallet
    }
    return wallet
}

const getWalletShort = wallet => {
    if (Dir.IsFullPath(Dir.DefaultPath + path.sep)) {
        return wallet.slice((Dir.DefaultPath + path.sep).length)
    }
    return wallet
}

const decryptWallet = (encryptedWallet, inputPassword) => {
    const bytes = CryptoJS.AES.decrypt(encryptedWallet, inputPassword)
    return bytes.toString(CryptoJS.enc.Utf8)
}

const fileExists = async (path) => {
    return new Promise((resolve, reject) => {
        fs.stat(path, (err) => {
            if (err === null) {
                resolve(true)
            } else {
                resolve(false)
            }
        })
    })
}

contextBridge.exposeInMainWorld('electron', {
    getPathForWallet,
    getWalletShort,
    walletLoaded: () => {
        ipcRenderer.send("wallet-loaded")
    },
    getExistingWalletFiles: async () => {
        if (!await fileExists(Dir.DefaultPath)) {
            await fs.mkdir(Dir.DefaultPath, {recursive: true})
        }
        const files = await fs.readdir(Dir.DefaultPath)
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
    openFileDialog: async () => {
        return await ipcRenderer.invoke("open-file-dialog")
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
        if (!Dir.IsFullPath(walletName)) {
            await fs.mkdir(Dir.DefaultPath, {recursive: true})
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
    getPassword: async () => {
        const {password} = await ipcRenderer.invoke("get-wallet")
        return password
    },
    listenAddedWallet: (handler) => {
        ipcRenderer.on("added-wallet", handler)
    },
    graphQL: async (query, variables) => {
        return await ipcRenderer.invoke("graphql", {query, variables})
    },
    openPreviewSend: async ({inputs, outputs, beatHash}) => {
        ipcRenderer.send("open-preview-send", {inputs, outputs, beatHash})
    },
    openTransaction: async ({txHash}) => {
        ipcRenderer.send("open-transaction", {txHash})
    },
    saveTransactions: async (transactions) => {
        await ipcRenderer.invoke("save-transactions", transactions)
    },
    saveBlock: async (block) => {
        await ipcRenderer.invoke("save-block", block)
    },
    saveMemoProfiles: async (profiles) => {
        await ipcRenderer.invoke("save-memo-profiles", profiles)
    },
    generateHistory: async (addresses) => {
        await ipcRenderer.invoke("generate-history", addresses)
    },
    getTransactions: async (addresses) => {
        return ipcRenderer.invoke("get-transactions", addresses)
    },
    getUtxos: async (addresses) => {
        return ipcRenderer.invoke("get-utxos", addresses)
    },
    getRecentAddressTransactions: async (addresses) => {
        return ipcRenderer.invoke("get-recent-addresses", addresses)
    },
    getTransaction: async (txHash) => {
        return ipcRenderer.invoke("get-transaction", txHash)
    },
    listenNewTxs: ({query, variables, handler, onopen, onclose}) => {
        const id = GetId()
        ipcRenderer.on("graphql-data-" + id, (evt, data) => {
            handler(data)
        })
        if (typeof onclose == "function") {
            ipcRenderer.on("graphql-close-" + id, (evt, data) => {
                onclose(data)
            })
        }
        if (typeof onopen == "function") {
            ipcRenderer.on("graphql-open-" + id, (evt, data) => {
                onopen(data)
            })
        }
        ipcRenderer.send("graphql-subscribe", {id, query, variables})
    },
    getWalletInfo: async (addresses) => {
        return ipcRenderer.invoke("get-wallet-info", addresses)
    },
    getCoins: async (addresses) => {
        return ipcRenderer.invoke("get-coins", addresses)
    },
    setWindowStorage: (key, value) => {
        ipcRenderer.send("set-window-storage", key, value)
    },
    getWindowStorage: (key) => {
        return ipcRenderer.invoke("get-window-storage", key)
    },
    closeWindow: () => {
        ipcRenderer.send("close-window")
    },
    listenDisplayModal: (handler) => {
        ipcRenderer.on("display-modal", handler)
    },
    rightClickMenu: () => {
        return ipcRenderer.invoke("right-click-menu")
    },
    getProfileInfo: (addresses) => {
        return ipcRenderer.invoke("get-profile-info", addresses)
    },
    getRecentSetName: (addresses) => {
        return ipcRenderer.invoke("get-recent-set-name", addresses)
    },
    getRecentSetProfile: (addresses) => {
        return ipcRenderer.invoke("get-recent-set-profile", addresses)
    },
    getRecentSetPic: (addresses) => {
        return ipcRenderer.invoke("get-recent-set-pic", addresses)
    },
})
