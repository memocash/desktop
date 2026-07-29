const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

module.exports = {
    checkForUpdates: async (force) => await ipcRenderer.invoke(Handlers.CheckForUpdates, force),
    getUpdatePrefs: async () => await ipcRenderer.invoke(Handlers.GetUpdatePrefs),
    setUpdatePrefs: async (prefs) => await ipcRenderer.invoke(Handlers.SetUpdatePrefs, prefs),
}
