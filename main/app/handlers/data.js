const {ipcMain} = require("electron");
const {SaveImagesFromProfiles} = require("../../client/images");
const {Handlers} = require("../../common/util");
const {SaveMemoProfiles, GetPic} = require("../../data/memo");
const {GetCoins} = require("../../data/tables");
const {
    SaveTransactions, SaveBlock, GenerateHistory, GetTransactions, GetUtxos, GetTransaction,
    GetRecentAddressTransactions
} = require("../../data/txs");

const DataHandlers = () => {
    ipcMain.handle(Handlers.SaveTransactions, async (e, transactions) => await SaveTransactions(transactions))
    ipcMain.handle(Handlers.SaveBlock, async (e, block) => await SaveBlock(block))
    ipcMain.handle(Handlers.GetPic, async (e, url) => await GetPic(url))
    ipcMain.handle(Handlers.GenerateHistory, async (e, addresses) => await GenerateHistory(addresses))
    ipcMain.handle(Handlers.GetTransaction, async (e, txHash) => GetTransaction(txHash))
    ipcMain.handle(Handlers.GetTransactions, async (e, addresses) => GetTransactions(addresses))
    ipcMain.handle(Handlers.GetUtxos, async (e, addresses) => GetUtxos(addresses))
    ipcMain.handle(Handlers.GetCoins, async (e, addresses) => GetCoins(addresses))
    ipcMain.handle(Handlers.GetRecentAddresses, async (e, addresses) => GetRecentAddressTransactions(addresses))
    ipcMain.handle(Handlers.SaveMemoProfiles, async (e, profiles) => {
        SaveImagesFromProfiles(profiles
            .concat(profiles.map(profile => profile.following ?
                profile.following.map(follow => follow.follow_lock.profile) : []).flat())
            .concat(profiles.map(profile => profile.followers ?
                profile.followers.map(follow => follow.lock.profile) : []).flat()))
        await SaveMemoProfiles(profiles)
    })
}

module.exports = {
    DataHandlers: DataHandlers,
}
