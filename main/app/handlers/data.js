const {ipcMain} = require("electron");
const {SaveImagesFromProfiles} = require("../../client/images");
const {Handlers} = require("../../common/util");
const {
    SaveTransactions, SaveBlock, GenerateHistory, GetTransactions, GetUtxos, GetTransaction,
    GetRecentAddressTransactions, SaveMemoProfiles, GetPic, GetCoins, SaveChatRoom, SaveChatRoomFollows, SaveMemoPosts
} = require("../../data/tables");
const {eConf} = require("../window");

const DataHandlers = () => {
    ipcMain.handle(Handlers.SaveTransactions, async (e, transactions) => await SaveTransactions(eConf(e), transactions))
    ipcMain.handle(Handlers.SaveBlock, async (e, block) => await SaveBlock(eConf(e), block))
    ipcMain.handle(Handlers.GetPic, async (e, url) => await GetPic(eConf(e), url))
    ipcMain.handle(Handlers.GenerateHistory, async (e, addresses) => await GenerateHistory(eConf(e), addresses))
    ipcMain.handle(Handlers.GetTransaction, async (e, txHash) => GetTransaction(eConf(e), txHash))
    ipcMain.handle(Handlers.GetTransactions, async (e, addresses) => GetTransactions(eConf(e), addresses))
    ipcMain.handle(Handlers.GetUtxos, async (e, addresses) => GetUtxos(eConf(e), addresses))
    ipcMain.handle(Handlers.GetCoins, async (e, addresses) => GetCoins(eConf(e), addresses))
    ipcMain.handle(Handlers.GetRecentAddresses, async (e, addresses) => GetRecentAddressTransactions(eConf(e), addresses))
    ipcMain.handle(Handlers.SaveChatRoom, async (e, room) => await SaveChatRoom(eConf(e), room))
    ipcMain.handle(Handlers.SaveChatRoomFollows, async (e, roomFollows) => await SaveChatRoomFollows(eConf(e), roomFollows))
    ipcMain.handle(Handlers.SaveMemoPosts, async (e, posts) => await SaveMemoPosts(eConf(e), posts))
    ipcMain.handle(Handlers.SaveMemoProfileImages, async (e, profiles) => {
        await SaveImagesFromProfiles(eConf(e), profiles
            .concat(profiles.map(profile => profile.following ?
                profile.following.map(follow => follow.follow_lock.profile) : []).flat())
            .concat(profiles.map(profile => profile.followers ?
                profile.followers.map(follow => follow.lock.profile) : []).flat()))
    })
    ipcMain.handle(Handlers.SaveMemoProfiles, async (e, profiles) => {
        await SaveMemoProfiles(eConf(e), profiles)
    })
}

module.exports = {
    DataHandlers: DataHandlers,
}
