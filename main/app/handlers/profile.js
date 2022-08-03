const {ipcMain} = require("electron");
const {GetProfileInfo, GetRecentSetName, GetRecentSetProfile, GetRecentSetPic} = require("../../data/memo");
const {GetRecentFollow, GetFollowers, GetFollowing, GetPosts} = require("../../data/tables");
const {Handlers} = require("../../common/util");

const ProfileHandlers = () => {
    ipcMain.handle(Handlers.GetProfileInfo, async (e, addresses) => {
        return GetProfileInfo(addresses)
    })
    ipcMain.handle(Handlers.GetRecentSetName, async (e, addresses) => {
        return GetRecentSetName(addresses)
    })
    ipcMain.handle(Handlers.GetRecentSetProfile, async (e, addresses) => {
        return GetRecentSetProfile(addresses)
    })
    ipcMain.handle(Handlers.GetRecentSetPic, async (e, addresses) => {
        return GetRecentSetPic(addresses)
    })
    ipcMain.handle(Handlers.GetRecentFollow, async (e, addresses, address) => {
        return GetRecentFollow(addresses, address)
    })
    ipcMain.handle(Handlers.GetFollowing, async (e, addresses) => {
        return GetFollowing(addresses)
    })
    ipcMain.handle(Handlers.GetFollowers, async (e, addresses) => {
        return GetFollowers(addresses)
    })
    ipcMain.handle(Handlers.GetPosts, async (e, addresses) => {
        return GetPosts(addresses)
    })
}

module.exports = {
    ProfileHandlers: ProfileHandlers,
}
