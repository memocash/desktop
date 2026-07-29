const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

// Nothing here touches the filesystem or a cipher. Each call names an operation
// and main decides whether to perform it - see main/app/keystore.js.
const updateWallet = (op) => async (values, password) =>
    ipcRenderer.invoke(Handlers.UpdateWallet, op, values, password)

module.exports = {
    addAddresses: updateWallet("addAddresses"),
    removeAddresses: updateWallet("removeAddresses"),
    addKeys: updateWallet("addKeys"),
    removeKeys: updateWallet("removeKeys"),
    addChangeList: updateWallet("addChangeList"),
    addSlpList: updateWallet("addSlpList"),
    changeSettings: updateWallet("changeSettings"),
    checkFile: async (walletName) => ipcRenderer.invoke(Handlers.CheckWalletFile, walletName),
    createFile: async (walletName, seedPhrase, keyList, addressList, password) =>
        ipcRenderer.invoke(Handlers.CreateWallet, walletName, seedPhrase, keyList, addressList, password),
    getExistingWalletFiles: async () => ipcRenderer.invoke(Handlers.GetExistingWalletFiles),
    getWalletInfo: async (addresses) => ipcRenderer.invoke(Handlers.GetWalletInfo, addresses),
    getWallet: async () => (await ipcRenderer.invoke(Handlers.GetWallet)).wallet,
    authenticateWallet: async (password) => ipcRenderer.invoke(Handlers.AuthenticateWallet, password),
    exportSeed: async (password) => ipcRenderer.invoke(Handlers.ExportSeed, password),
    exportPrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.ExportPrivateKey, address, password),
    removePrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.RemovePrivateKey, address, password),
    getWalletFileInfo: async () => ipcRenderer.invoke(Handlers.GetWalletFileInfo),
    isWalletFileEncrypted: async (walletName) => ipcRenderer.invoke(Handlers.WalletFileIsEncrypted, walletName),
    unlockWallet: async (walletName, password) => ipcRenderer.invoke(Handlers.UnlockWallet, walletName, password),
    walletLoaded: () => ipcRenderer.send(Handlers.WalletLoaded),
    saveNetworkConfig: async (networkConfig) => ipcRenderer.invoke(Handlers.SaveNetworkConfig, networkConfig),
    signTransaction: async (request, password) =>
        ipcRenderer.invoke(Handlers.SignTransaction, request, password),
    getNetworkConfig: async () => ipcRenderer.invoke(Handlers.GetNetworkConfig),
    getWindowNetwork: async () => await ipcRenderer.invoke(Handlers.GetWindowNetwork),
    setWindowNetwork: async (network) => await ipcRenderer.invoke(Handlers.SetWindowNetwork, network),
}
