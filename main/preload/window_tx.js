const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    openPreviewSend: async ({inputs, outputs, beatHash}) => ipcRenderer.send(Handlers.OpenPreviewSend, {
        inputs, outputs, beatHash
    }),
    openTransaction: async ({txHash}) => ipcRenderer.send(Handlers.OpenTransaction, {txHash}),
}
