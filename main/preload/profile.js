const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    getFollowing: (addresses) => ipcRenderer.invoke(Handlers.GetFollowing, addresses),
    getFollowers: (addresses) => ipcRenderer.invoke(Handlers.GetFollowers, addresses),
    getPic: (url) => ipcRenderer.invoke("get-pic", url),
    getPost: async (txHash) => await ipcRenderer.invoke(Handlers.GetPost, txHash),
    getPosts: (addresses) => ipcRenderer.invoke(Handlers.GetPosts, addresses),
    getProfileInfo: (addresses) => ipcRenderer.invoke(Handlers.GetProfileInfo, addresses),
    getRecentFollow: (addresses, address) => ipcRenderer.invoke(Handlers.GetRecentFollow, addresses, address),
    getRecentSetName: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetName, addresses),
    getRecentSetPic: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetPic, addresses),
    getRecentSetProfile: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetProfile, addresses),
    saveMemoProfiles: async (profiles) => await ipcRenderer.invoke(Handlers.SaveMemoProfiles, profiles),
}
