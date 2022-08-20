const {ipcMain} = require("electron");
const {
    GetFollowers, GetFollowing, GetLikes, GetPost, GetPostParent, GetPostReplies, GetPosts, GetProfileInfo,
    GetRecentFollow, GetRecentSetName, GetRecentSetPic, GetRecentSetProfile, GetRoomPosts, GetChatFollows,
    GetRecentRoomFollow, GetRoomFollowCount, GetRoomFollows,
} = require("../../data/tables");
const {Handlers} = require("../../common/util");

const ProfileHandlers = () => {
    ipcMain.handle(Handlers.GetChatFollows, async (e, {addresses}) => GetChatFollows({addresses}))
    ipcMain.handle(Handlers.GetChatPosts, async (e, {room, userAddresses}) => GetRoomPosts({room, userAddresses}))
    ipcMain.handle(Handlers.GetChatRoomFollowCount, async (e, {room}) => GetRoomFollowCount({room}))
    ipcMain.handle(Handlers.GetChatRoomFollows, async (e, {room}) => GetRoomFollows({room}))
    ipcMain.handle(Handlers.GetProfileInfo, async (e, addresses) => GetProfileInfo(addresses))
    ipcMain.handle(Handlers.GetRecentRoomFollow, async (e, addresses, room) => GetRecentRoomFollow(addresses, room))
    ipcMain.handle(Handlers.GetRecentSetName, async (e, addresses) => GetRecentSetName(addresses))
    ipcMain.handle(Handlers.GetRecentSetProfile, async (e, addresses) => GetRecentSetProfile(addresses))
    ipcMain.handle(Handlers.GetRecentSetPic, async (e, addresses) => GetRecentSetPic(addresses))
    ipcMain.handle(Handlers.GetRecentFollow, async (e, addresses, address) => GetRecentFollow(addresses, address))
    ipcMain.handle(Handlers.GetFollowing, async (e, addresses) => GetFollowing(addresses))
    ipcMain.handle(Handlers.GetFollowers, async (e, addresses) => GetFollowers(addresses))
    ipcMain.handle(Handlers.GetLikes, async (e, txHash) => GetLikes(txHash))
    ipcMain.handle(Handlers.GetPost, async (e, {txHash, userAddresses}) => GetPost({txHash, userAddresses}))
    ipcMain.handle(Handlers.GetPosts, async (e, {addresses, userAddresses}) => GetPosts({addresses, userAddresses}))
    ipcMain.handle(Handlers.GetPostParent, async (e, {txHash, userAddresses}) => GetPostParent({txHash, userAddresses}))
    ipcMain.handle(Handlers.GetPostReplies, async (e, {txHash, userAddresses}) =>
        GetPostReplies({txHash, userAddresses}))
}

module.exports = {
    ProfileHandlers: ProfileHandlers,
}
