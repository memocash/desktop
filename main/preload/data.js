const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    generateHistory: async (addresses) => await ipcRenderer.invoke(Handlers.GenerateHistory, addresses),
    getCoins: async (addresses) => ipcRenderer.invoke(Handlers.GetCoins, addresses),
    getRecentAddressTransactions: async (addresses) => ipcRenderer.invoke(Handlers.GetRecentAddresses, addresses),
    getTransaction: async (txHash) => ipcRenderer.invoke(Handlers.GetTransaction, txHash),
    getAddressTokenBalances: async (addresses) => ipcRenderer.invoke(Handlers.GetAddressTokenBalances, addresses),
    getTokenBalances: async (addresses) => ipcRenderer.invoke(Handlers.GetTokenBalances, addresses),
    getTransactions: async (addresses) => ipcRenderer.invoke(Handlers.GetTransactions, addresses),
    getSlpGenesis: async (hash) => ipcRenderer.invoke(Handlers.GetSlpGenesis, hash),
    getUncheckedSlpTxs: async (addresses) => ipcRenderer.invoke(Handlers.GetUncheckedSlpTxs, addresses),
    getUtxos: async (addresses) => ipcRenderer.invoke(Handlers.GetUtxos, addresses),
    saveSlp: async (txs) => await ipcRenderer.invoke(Handlers.SaveSlp, txs),
    saveBlock: async (block) => await ipcRenderer.invoke(Handlers.SaveBlock, block),
    saveTransactions: async (transactions) => await ipcRenderer.invoke(Handlers.SaveTransactions, transactions),
}
