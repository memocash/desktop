const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

// Nothing here touches the filesystem or a cipher. Each call names an operation
// and main decides whether to perform it - see main/app/keystore.js.
const updateWallet = (op) => async (values) => ipcRenderer.invoke(Handlers.UpdateWallet, op, values)

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
    generateWallet: async (seed, keys) => ipcRenderer.invoke(Handlers.GenerateWallet, seed, keys),
    getWallet: async () => (await ipcRenderer.invoke(Handlers.GetWallet)).wallet,
    // Still reachable until per-operation authentication lands, at which point
    // the window stops handing the password back across this boundary at all.
    getPassword: async () => (await ipcRenderer.invoke(Handlers.GetWallet)).password,
    getWalletFileInfo: async () => ipcRenderer.invoke(Handlers.GetWalletFileInfo),
    isWalletFileEncrypted: async (walletName) => ipcRenderer.invoke(Handlers.WalletFileIsEncrypted, walletName),
    unlockWallet: async (walletName, password) => ipcRenderer.invoke(Handlers.UnlockWallet, walletName, password),
    walletLoaded: () => ipcRenderer.send(Handlers.WalletLoaded),
    saveNetworkConfig: async (networkConfig) => ipcRenderer.invoke(Handlers.SaveNetworkConfig, networkConfig),
    getNetworkConfig: async () => ipcRenderer.invoke(Handlers.GetNetworkConfig),
    getWindowNetwork: async () => await ipcRenderer.invoke(Handlers.GetWindowNetwork),
    setWindowNetwork: async (network) => await ipcRenderer.invoke(Handlers.SetWindowNetwork, network),
}
