const {ipcMain} = require("electron");
const {Handlers} = require("../../common/util");
const {CreateTxWindow} = require("../window");

const WindowTxHandlers = () => {
    ipcMain.on(Handlers.OpenPreviewSend, async (e, {inputs, outputs, beatHash}) => {
        await CreateTxWindow(e.sender.id, {inputs, outputs, beatHash})
    })
    ipcMain.on(Handlers.OpenTransaction, async (e, {txHash}) => {
        await CreateTxWindow(e.sender.id, {txHash})
    })
}

module.exports = {
    WindowTxHandlers: WindowTxHandlers,
}
