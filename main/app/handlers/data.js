const {ipcMain} = require("electron");
const {SaveImagesFromProfiles} = require("../../client/images");
const {Handlers} = require("../../common/util");
const {
    SaveTransactions, SaveBlock, GenerateHistory, GetTransactions, GetUtxos, GetTransaction,
    GetRecentAddressTransactions, SaveMemoProfiles, GetPic, GetCoins, SaveChatRoom, SaveChatRoomFollows, SaveMemoPosts
} = require("../../data/tables");

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
    ipcMain.handle(Handlers.SaveChatRoom, async (e, room) => await SaveChatRoom(room))
    ipcMain.handle(Handlers.SaveChatRoomFollows, async (e, roomFollows) => await SaveChatRoomFollows(roomFollows))
    ipcMain.handle(Handlers.SaveMemoPosts, async (e, posts) => await SaveMemoPosts(posts))
    ipcMain.handle(Handlers.SaveMemoProfileImages, async (e, profiles) => {
        await SaveImagesFromProfiles(profiles
            .concat(profiles.map(profile => profile.following ?
                profile.following.map(follow => follow.follow_lock.profile) : []).flat())
            .concat(profiles.map(profile => profile.followers ?
                profile.followers.map(follow => follow.lock.profile) : []).flat()))
    })
    ipcMain.handle(Handlers.SaveMemoProfiles, async (e, profiles) => {
        await SaveMemoProfiles(profiles)
    })
}

module.exports = {
    DataHandlers: DataHandlers,
}
