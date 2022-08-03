const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    generateHistory: async (addresses) => await ipcRenderer.invoke(Handlers.GenerateHistory, addresses),
    getCoins: async (addresses) => ipcRenderer.invoke(Handlers.GetCoins, addresses),
    getRecentAddressTransactions: async (addresses) => ipcRenderer.invoke(Handlers.GetRecentAddresses, addresses),
    getTransaction: async (txHash) => ipcRenderer.invoke(Handlers.GetTransaction, txHash),
    getTransactions: async (addresses) => ipcRenderer.invoke(Handlers.GetTransactions, addresses),
    getUtxos: async (addresses) => ipcRenderer.invoke(Handlers.GetUtxos, addresses),
    saveBlock: async (block) => await ipcRenderer.invoke(Handlers.SaveBlock, block),
    saveTransactions: async (transactions) => await ipcRenderer.invoke(Handlers.SaveTransactions, transactions),
}
