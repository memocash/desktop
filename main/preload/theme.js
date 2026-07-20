const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    getTheme: async () => await ipcRenderer.invoke(Handlers.GetTheme),
    setTheme: async (theme) => await ipcRenderer.invoke(Handlers.SetTheme, theme),
}
