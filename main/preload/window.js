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
    // The page's callback gets the payload only, never the IpcRendererEvent -
    // handing the raw event across the context bridge would marshal an object
    // the page has no business holding, the way graphql.js already avoids.
    listenDisplayModal: (handler) =>
        ipcRenderer.on(Listeners.DisplayModal, (e, ...args) => handler(...args)),
    openExternal: (url) => ipcRenderer.send(Handlers.OpenExternal, url),
    openFileDialog: async () => await ipcRenderer.invoke(Handlers.OpenFileDialog),
    rightClickMenu: (address, wallet) => ipcRenderer.invoke(Handlers.RightClickMenu, address, wallet),
    coinsMenu: (hash, index, value, address) => ipcRenderer.invoke(Handlers.CoinsMenu, hash, index, value, address),
    setWindowStorage: (key, value) => ipcRenderer.send(Handlers.SetWindowStorage, key, value),
    showMessageDialog: (message) => ipcRenderer.send(Handlers.ShowMessageDialog, message),
    showNotification: (options) => ipcRenderer.send(Handlers.ShowNotification, options),
    listenSelectTab: (handler) =>
        ipcRenderer.on(Listeners.SelectTab, (e, ...args) => handler(...args)),
    listenToggleTab: (handler) =>
        ipcRenderer.on(Listeners.ToggleTab, (e, ...args) => handler(...args)),
}
