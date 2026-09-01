const {ipcMain} = require("../ipc");
const {Handlers} = require("../../common/util");
const {
    GetTransactions, GetUtxos, GetTransaction, GetPic, GetCoins,
    GetAddressTokenBalances, GetNotifications, GetSlpGenesis, GetTokenBalances, GetTokenBatons,
} = require("../../data/tables");
const {eConf} = require("../window");

// Reads only. The renderer shows what the database holds; what goes into it
// arrives through main's own syncs (handlers/sync.js), never from the page.
const DataHandlers = () => {
    ipcMain.handle(Handlers.GetPic, async (e, url) => await GetPic(eConf(e), url))
    ipcMain.handle(Handlers.GetTransaction, async (e, txHash) => GetTransaction(eConf(e), txHash))
    ipcMain.handle(Handlers.GetTransactions, async (e, addresses) => GetTransactions(eConf(e), addresses))
    ipcMain.handle(Handlers.GetUtxos, async (e, addresses) => GetUtxos(eConf(e), addresses))
    ipcMain.handle(Handlers.GetCoins, async (e, addresses) => GetCoins(eConf(e), addresses))
    ipcMain.handle(Handlers.GetNotifications, async (e, addresses) => GetNotifications(eConf(e), addresses))
    ipcMain.handle(Handlers.GetAddressTokenBalances, async (e, addresses) => GetAddressTokenBalances(eConf(e), addresses))
    ipcMain.handle(Handlers.GetTokenBalances, async (e, addresses) => GetTokenBalances(eConf(e), addresses))
    ipcMain.handle(Handlers.GetTokenBatons, async (e, addresses) => GetTokenBatons(eConf(e), addresses))
    ipcMain.handle(Handlers.GetSlpGenesis, async (e, hash) => GetSlpGenesis(eConf(e), hash))
}

module.exports = {
    DataHandlers: DataHandlers,
}
