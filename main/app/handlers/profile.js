const {ipcMain} = require("electron");
const {GetProfileInfo, GetRecentSetName, GetRecentSetProfile, GetRecentSetPic} = require("../../data/memo");
const {GetRecentFollow, GetFollowers, GetFollowing, GetPost, GetPosts} = require("../../data/tables");
const {Handlers} = require("../../common/util");

const ProfileHandlers = () => {
    ipcMain.handle(Handlers.GetProfileInfo, async (e, addresses) => GetProfileInfo(addresses))
    ipcMain.handle(Handlers.GetRecentSetName, async (e, addresses) => GetRecentSetName(addresses))
    ipcMain.handle(Handlers.GetRecentSetProfile, async (e, addresses) => GetRecentSetProfile(addresses))
    ipcMain.handle(Handlers.GetRecentSetPic, async (e, addresses) => GetRecentSetPic(addresses))
    ipcMain.handle(Handlers.GetRecentFollow, async (e, addresses, address) => GetRecentFollow(addresses, address))
    ipcMain.handle(Handlers.GetFollowing, async (e, addresses) => GetFollowing(addresses))
    ipcMain.handle(Handlers.GetFollowers, async (e, addresses) => GetFollowers(addresses))
    ipcMain.handle(Handlers.GetPost, async (e, txHash) => GetPost(txHash))
    ipcMain.handle(Handlers.GetPosts, async (e, addresses) => GetPosts(addresses))
}

module.exports = {
    ProfileHandlers: ProfileHandlers,
}
