const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

// Nothing here touches the filesystem or a cipher. Each call names an operation
// and main decides whether to perform it - see main/app/keystore.js.
//
// The session key lives here and nowhere else on this side. Main holds the
// password sealed under it and neither half is a password alone, so a spend
// needs both; keeping the key in the preload rather than handing it to the page
// means script in the page - or anything that got itself into the renderer
// bundle - can ask for a spend within the budget but cannot read the key or take
// it anywhere. It lasts as long as the document does: a reload takes it with it,
// and main's half then opens for nobody, so the next spend asks for the password.
let sessionKey

// Strips the session key out of a main-process reply, keeping it on this side of
// the context bridge. A reply with no key leaves the current one alone; only
// unlocking replaces it outright.
const keepSessionKey = ({sessionKey: key, ...rest}) => {
    if (key) {
        sessionKey = key
    }
    return rest
}
const updateWallet = (op) => async (values, password) =>
    ipcRenderer.invoke(Handlers.UpdateWallet, op, values, password)

module.exports = {
    addAddresses: updateWallet("addAddresses"),
    removeAddresses: updateWallet("removeAddresses"),
    addKeys: updateWallet("addKeys"),
    removeKeys: updateWallet("removeKeys"),
    changeSettings: updateWallet("changeSettings"),
    checkFile: async (walletName) => ipcRenderer.invoke(Handlers.CheckWalletFile, walletName),
    createFile: async (walletName, seedPhrase, keyList, addressList, password) =>
        ipcRenderer.invoke(Handlers.CreateWallet, walletName, seedPhrase, keyList, addressList, password),
    getExistingWalletFiles: async () => ipcRenderer.invoke(Handlers.GetExistingWalletFiles),
    getWalletInfo: async (addresses) => ipcRenderer.invoke(Handlers.GetWalletInfo, addresses),
    getWallet: async () => ipcRenderer.invoke(Handlers.GetWallet),
    authenticateWallet: async (password) => ipcRenderer.invoke(Handlers.AuthenticateWallet, password),
    exportSeed: async (password) => ipcRenderer.invoke(Handlers.ExportSeed, password),
    exportPrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.ExportPrivateKey, address, password),
    removePrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.RemovePrivateKey, address, password),
    getWalletFileInfo: async () => ipcRenderer.invoke(Handlers.GetWalletFileInfo),
    isWalletFileEncrypted: async (walletName) => ipcRenderer.invoke(Handlers.WalletFileIsEncrypted, walletName),
    unlockWallet: async (walletName, password) => {
        sessionKey = undefined
        return keepSessionKey(
            await ipcRenderer.invoke(Handlers.UnlockWallet, walletName, password))
    },
    walletLoaded: () => ipcRenderer.send(Handlers.WalletLoaded),
    saveNetworkConfig: async (networkConfig) => ipcRenderer.invoke(Handlers.SaveNetworkConfig, networkConfig),
    // With no password offered, the session key stands in for one - main decides
    // whether the budget covers this transaction, and says so if it doesn't.
    signTransaction: async (request, password) => keepSessionKey(
        await ipcRenderer.invoke(Handlers.SignTransaction, request, password,
            password === undefined || password === null ? sessionKey : undefined)),
    getNetworkConfig: async () => ipcRenderer.invoke(Handlers.GetNetworkConfig),
    getWindowNetwork: async () => await ipcRenderer.invoke(Handlers.GetWindowNetwork),
    setWindowNetwork: async (network) => await ipcRenderer.invoke(Handlers.SetWindowNetwork, network),
}
