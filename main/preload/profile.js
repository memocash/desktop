const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    getFollowing: (addresses) => ipcRenderer.invoke(Handlers.GetFollowing, addresses),
    getFollowers: (addresses) => ipcRenderer.invoke(Handlers.GetFollowers, addresses),
    getPic: (url) => ipcRenderer.invoke("get-pic", url),
    getLikes: async (txHash) => await ipcRenderer.invoke(Handlers.GetLikes, txHash),
    getPost: async ({txHash, userAddresses}) => await ipcRenderer.invoke(Handlers.GetPost, {txHash, userAddresses}),
    getPosts: ({addresses, userAddresses}) => ipcRenderer.invoke(Handlers.GetPosts, {addresses, userAddresses}),
    getPostParent: ({txHash, userAddresses}) => ipcRenderer.invoke(Handlers.GetPostParent, {txHash, userAddresses}),
    getPostReplies: ({txHash, userAddresses}) => ipcRenderer.invoke(Handlers.GetPostReplies, {txHash, userAddresses}),
    getProfileInfo: (addresses) => ipcRenderer.invoke(Handlers.GetProfileInfo, addresses),
    getRecentFollow: (addresses, address) => ipcRenderer.invoke(Handlers.GetRecentFollow, addresses, address),
    getRecentSetName: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetName, addresses),
    getRecentSetPic: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetPic, addresses),
    getRecentSetProfile: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetProfile, addresses),
    saveMemoPosts: async (posts) => await ipcRenderer.invoke(Handlers.SaveMemoPosts, posts),
    saveMemoProfiles: async (profiles) => await ipcRenderer.invoke(Handlers.SaveMemoProfiles, profiles),
}
