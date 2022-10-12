const fs = require("fs/promises")
const CryptoJS = require("crypto-js");
const {ipcRenderer} = require("electron");
const {Handlers, Dir} = require("../common/util");
const {decryptWallet, getPathForWallet, fileExists} = require("./common");
const path = require("path");
const fsOriginal = require("fs");

module.exports = {
    addAddresses: async (addressList) => {
        const {filename, password} = await ipcRenderer.invoke(Handlers.GetWallet)
        let walletJson = await fsOriginal.readFileSync(filename, {encoding: "utf8"})
        if (password && password.length) {
            walletJson = decryptWallet(walletJson, password)
        }
        const wallet = JSON.parse(walletJson)
        if (!wallet.addresses) {
            wallet.addresses = []
        }
        wallet.addresses.push(...addressList)
        wallet.addresses = [...new Set(wallet.addresses)]
        let contents = JSON.stringify(wallet)
        if (password && password.length) {
            contents = CryptoJS.AES.encrypt(contents, password).toString()
        }
        await fsOriginal.writeFileSync(filename, contents)
        await ipcRenderer.send(Handlers.StoreWallet, wallet, filename, password)
    },
    addKeys: async (keyList) => {
        const {filename, password} = await ipcRenderer.invoke(Handlers.GetWallet)
        let walletJson = await fsOriginal.readFileSync(filename, {encoding: "utf8"})
        if (password && password.length) {
            walletJson = decryptWallet(walletJson, password)
        }
        const wallet = JSON.parse(walletJson)
        if (!wallet.keys) {
            wallet.keys = []
        }
        wallet.keys.push(...keyList)
        wallet.keys = [...new Set(wallet.keys)]
        let contents = JSON.stringify(wallet)
        if (password && password.length) {
            contents = CryptoJS.AES.encrypt(contents, password).toString()
        }
        await fsOriginal.writeFileSync(filename, contents)
        await ipcRenderer.send(Handlers.StoreWallet, wallet, filename, password)
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
        await ipcRenderer.send(Handlers.StoreWallet, JSON.parse(wallet), filename, password)
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
    getPassword: async () => (await ipcRenderer.invoke(Handlers.GetWallet)).password,
    getWalletInfo: async (addresses) => ipcRenderer.invoke(Handlers.GetWalletInfo, addresses),
    getWallet: async () => (await ipcRenderer.invoke(Handlers.GetWallet)).wallet,
    getWalletFile: async (walletName) => await fs.readFile(getPathForWallet(walletName), {encoding: "utf8"}),
    setWallet: async (wallet, filename, password) =>
        ipcRenderer.send(Handlers.StoreWallet, wallet, getPathForWallet(filename), password),
    walletLoaded: () => ipcRenderer.send(Handlers.WalletLoaded),
    saveNetworkConfig: async (networkConfig) => {
        await fs.writeFile(Dir.NetworkConfigFile, JSON.stringify(networkConfig, null, 2)+"\n")
    },
    getWindowNetwork: async () => await ipcRenderer.invoke(Handlers.GetWindowNetwork),
    setWindowNetwork: async (network) => await ipcRenderer.invoke(Handlers.SetWindowNetwork, network),
    getNetworkConfig: async () => {
        if (!await fileExists(Dir.NetworkConfigFile)) {
            return
        }
        return JSON.parse(await fs.readFile(getPathForWallet(Dir.NetworkConfigFile), {encoding: "utf8"}))
    },
}
