const {ipcRenderer, clipboard} = require("electron");
const {Handlers, Listeners} = require("../common/util");

module.exports = {
    clearClipboard: () => clipboard.clear(),
    closeWindow: () => ipcRenderer.send(Handlers.CloseWindow),
    getWindowId: async () => await ipcRenderer.invoke(Handlers.GetWindowId),
    getWindowStorage: (key) => ipcRenderer.invoke(Handlers.GetWindowStorage, key),
    listenDisplayModal: (handler) => ipcRenderer.on(Listeners.DisplayModal, handler),
    openFileDialog: async () => await ipcRenderer.invoke(Handlers.OpenFileDialog),
    rightClickMenu: () => ipcRenderer.invoke(Handlers.RightClickMenu),
    setWindowStorage: (key, value) => ipcRenderer.send(Handlers.SetWindowStorage, key, value),
    showMessageDialog: (message) => ipcRenderer.send(Handlers.ShowMessageDialog, message),
}
