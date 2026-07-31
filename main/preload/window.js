const {ipcRenderer} = require("electron");
const {Handlers, Listeners} = require("../common/util/handlers");

module.exports = {
    // A sandboxed preload gets only contextBridge, crashReporter, ipcRenderer,
    // nativeImage, webFrame, and webUtils out of the electron module - clipboard
    // is not among them - so the clearing happens in main.
    clearClipboard: () => ipcRenderer.send(Handlers.ClearClipboard),
    closeWindow: () => ipcRenderer.send(Handlers.CloseWindow),
    getWindowId: async () => await ipcRenderer.invoke(Handlers.GetWindowId),
    getAppInfo: async () => await ipcRenderer.invoke(Handlers.GetAppInfo),
    getWindowStorage: (key) => ipcRenderer.invoke(Handlers.GetWindowStorage, key),
    listenDisplayModal: (handler) => ipcRenderer.on(Listeners.DisplayModal, handler),
    openFileDialog: async () => await ipcRenderer.invoke(Handlers.OpenFileDialog),
    rightClickMenu: (address, wallet) => ipcRenderer.invoke(Handlers.RightClickMenu, address, wallet),
    coinsMenu: (hash, index, value, address) => ipcRenderer.invoke(Handlers.CoinsMenu, hash, index, value, address),
    setWindowStorage: (key, value) => ipcRenderer.send(Handlers.SetWindowStorage, key, value),
    showMessageDialog: (message) => ipcRenderer.send(Handlers.ShowMessageDialog, message),
    showNotification: (options) => ipcRenderer.send(Handlers.ShowNotification, options),
    listenSelectTab: (handler) => ipcRenderer.on(Listeners.SelectTab, handler),
    listenToggleTab: (handler) => ipcRenderer.on(Listeners.ToggleTab, handler),
}
