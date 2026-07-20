const {ipcMain} = require("electron");
const {
    GetFollowers, GetFollowing, GetLikes, GetLinkedAddresses, GetNewPosts, GetPost, GetPostParent, GetPostReplies,
    GetPosts, GetPotentialLinkRequests, GetProfileInfo, GetProfileLinks, GetRecentFollow, GetRecentSetName,
    GetRecentSetPic, GetRecentSetProfile, GetRoomPosts, GetChatFollows, GetRecentRoomFollow, GetRoomFollowCount,
    GetRoomFollows, GetAddressesRoomFollowCount, GetWalletLinks,
} = require("../../data/tables");
const {Handlers} = require("../../common/util");
const {eConf} = require("../window");

const ProfileHandlers = () => {
    ipcMain.handle(Handlers.GetAddressesRoomFollowCount, async (e, {addresses}) =>
        GetAddressesRoomFollowCount({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.GetChatFollows, async (e, {addresses}) => GetChatFollows({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.GetChatPosts, async (e, {room, userAddresses}) =>
        GetRoomPosts({conf: eConf(e), room, userAddresses}))
    ipcMain.handle(Handlers.GetChatRoomFollowCount, async (e, {room}) => GetRoomFollowCount({conf: eConf(e), room}))
    ipcMain.handle(Handlers.GetChatRoomFollows, async (e, {room}) => GetRoomFollows({conf: eConf(e), room}))
    ipcMain.handle(Handlers.GetProfileInfo, async (e, addresses) => GetProfileInfo(eConf(e), addresses))
    ipcMain.handle(Handlers.GetProfileLinks, async (e, {userAddresses, addresses}) =>
        GetProfileLinks(eConf(e), {userAddresses, addresses}))
    ipcMain.handle(Handlers.GetRecentRoomFollow, async (e, addresses, room) =>
        GetRecentRoomFollow(eConf(e), addresses, room))
    ipcMain.handle(Handlers.GetRecentSetName, async (e, addresses) => GetRecentSetName(eConf(e), addresses))
    ipcMain.handle(Handlers.GetRecentSetProfile, async (e, addresses) => GetRecentSetProfile(eConf(e), addresses))
    ipcMain.handle(Handlers.GetRecentSetPic, async (e, addresses) => GetRecentSetPic(eConf(e), addresses))
    ipcMain.handle(Handlers.GetRecentFollow, async (e, addresses, address) =>
        GetRecentFollow(eConf(e), addresses, address))
    ipcMain.handle(Handlers.GetFollowing, async (e, addresses) => GetFollowing(eConf(e), addresses))
    ipcMain.handle(Handlers.GetFollowers, async (e, addresses) => GetFollowers(eConf(e), addresses))
    ipcMain.handle(Handlers.GetLikes, async (e, txHash) => GetLikes(eConf(e), txHash))
    ipcMain.handle(Handlers.GetLinkedAddresses, async (e, addresses) => GetLinkedAddresses(eConf(e), addresses))
    ipcMain.handle(Handlers.GetPotentialLinkRequests, async (e) => GetPotentialLinkRequests(eConf(e)))
    ipcMain.handle(Handlers.GetWalletLinks, async (e, addresses) => GetWalletLinks(eConf(e), addresses))
    ipcMain.handle(Handlers.GetNewPosts, async (e, {userAddresses, ranked}) =>
        GetNewPosts({conf: eConf(e), userAddresses, ranked}))
    ipcMain.handle(Handlers.GetPost, async (e, {txHash, userAddresses}) =>
        GetPost({conf: eConf(e), txHash, userAddresses}))
    ipcMain.handle(Handlers.GetPosts, async (e, {addresses, userAddresses}) =>
        GetPosts({conf: eConf(e), addresses, userAddresses}))
    ipcMain.handle(Handlers.GetPostParent, async (e, {txHash, userAddresses}) =>
        GetPostParent({conf: eConf(e), txHash, userAddresses}))
    ipcMain.handle(Handlers.GetPostReplies, async (e, {txHash, userAddresses}) =>
        GetPostReplies({conf: eConf(e), txHash, userAddresses}))
}

module.exports = {
    ProfileHandlers: ProfileHandlers,
}
