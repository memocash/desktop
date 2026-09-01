const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

module.exports = {
    getCoins: async (addresses) => ipcRenderer.invoke(Handlers.GetCoins, addresses),
    getNotifications: async (addresses) => ipcRenderer.invoke(Handlers.GetNotifications, addresses),
    getTransaction: async (txHash) => ipcRenderer.invoke(Handlers.GetTransaction, txHash),
    getAddressTokenBalances: async (addresses) => ipcRenderer.invoke(Handlers.GetAddressTokenBalances, addresses),
    getTokenBalances: async (addresses) => ipcRenderer.invoke(Handlers.GetTokenBalances, addresses),
    getTokenBatons: async (addresses) => ipcRenderer.invoke(Handlers.GetTokenBatons, addresses),
    getTransactions: async (addresses) => ipcRenderer.invoke(Handlers.GetTransactions, addresses),
    getSlpGenesis: async (hash) => ipcRenderer.invoke(Handlers.GetSlpGenesis, hash),
    getUtxos: async (addresses) => ipcRenderer.invoke(Handlers.GetUtxos, addresses),
}
