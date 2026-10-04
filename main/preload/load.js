const {contextBridge, ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");
const network = require("./network");
const {clearClipboard, getWindowId, openFileDialog, showMessageDialog} = require("./window");

// The load page's bridge: choose or create a wallet, and nothing a wallet
// does once open. This is the one preload that can offer main a password or
// ask it for seed words, and it is loaded only into the windows main opens on
// the load page, from disk (see main/app/window.js). The wallet page's
// preload names none of these, and main's load surface would refuse it if it
// did (see main/app/ipc.js).
//
// No session key is ever held here. Unlocking used to hand the key back to
// the preload that asked; now the wallet opens in a window of its own, and
// main sends the key to that window's preload directly. All this page learns
// is that it worked - and by then its window is closing.
contextBridge.exposeInMainWorld("electron", {
    // Answers {exists, encrypted} - what the load screen needs to decide whether
    // to offer opening, creating, or a password box.
    checkFile: async (walletName) => ipcRenderer.invoke(Handlers.CheckWalletFile, walletName),
    // No seed crosses here: useSeed says the wallet should be built on the
    // pending seed main already holds for this window - the one it generated
    // or was handed to import, and saw confirmed.
    createFile: async (walletName, useSeed, keyList, addressList, password) =>
        ipcRenderer.invoke(Handlers.CreateWallet, walletName, useSeed, keyList, addressList, password),
    generateSeed: async () => ipcRenderer.invoke(Handlers.GenerateSeed),
    importSeed: async (phrase) => ipcRenderer.invoke(Handlers.ImportSeed, phrase),
    confirmSeed: async (typed) => ipcRenderer.invoke(Handlers.ConfirmSeed, typed),
    getExistingWalletFiles: async () => ipcRenderer.invoke(Handlers.GetExistingWalletFiles),
    unlockWallet: async (walletName, password) =>
        ipcRenderer.invoke(Handlers.UnlockWallet, walletName, password),
    ...network,
    clearClipboard,
    getWindowId,
    openFileDialog,
    showMessageDialog,
})
