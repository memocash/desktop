const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util");

module.exports = {
    getAddressesRoomFollowCount: async ({addresses}) =>
        await ipcRenderer.invoke(Handlers.GetAddressesRoomFollowCount, {addresses}),
    getChatFollows: async ({addresses}) => await ipcRenderer.invoke(Handlers.GetChatFollows, {addresses}),
    getChatPosts: async ({room, userAddresses}) =>
        await ipcRenderer.invoke(Handlers.GetChatPosts, {room, userAddresses}),
    getChatRoomFollowCount: async ({room}) => await ipcRenderer.invoke(Handlers.GetChatRoomFollowCount, {room}),
    getChatRoomFollows: async ({room}) => await ipcRenderer.invoke(Handlers.GetChatRoomFollows, {room}),
    getFollowing: (addresses) => ipcRenderer.invoke(Handlers.GetFollowing, addresses),
    getFollowers: (addresses) => ipcRenderer.invoke(Handlers.GetFollowers, addresses),
    getPic: (url) => ipcRenderer.invoke(Handlers.GetPic, url),
    getLikes: async (txHash) => await ipcRenderer.invoke(Handlers.GetLikes, txHash),
    getPost: async ({txHash, userAddresses}) => await ipcRenderer.invoke(Handlers.GetPost, {txHash, userAddresses}),
    getPosts: ({addresses, userAddresses}) => ipcRenderer.invoke(Handlers.GetPosts, {addresses, userAddresses}),
    getPostParent: ({txHash, userAddresses}) => ipcRenderer.invoke(Handlers.GetPostParent, {txHash, userAddresses}),
    getPostReplies: ({txHash, userAddresses}) => ipcRenderer.invoke(Handlers.GetPostReplies, {txHash, userAddresses}),
    getProfileInfo: (addresses) => ipcRenderer.invoke(Handlers.GetProfileInfo, addresses),
    getRecentFollow: (addresses, address) => ipcRenderer.invoke(Handlers.GetRecentFollow, addresses, address),
    getRecentRoomFollow: (addresses, room) => ipcRenderer.invoke(Handlers.GetRecentRoomFollow, addresses, room),
    getRecentSetName: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetName, addresses),
    getRecentSetPic: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetPic, addresses),
    getRecentSetProfile: (addresses) => ipcRenderer.invoke(Handlers.GetRecentSetProfile, addresses),
    saveChatRoom: async (room) => await ipcRenderer.invoke(Handlers.SaveChatRoom, room),
    saveChatRoomFollows: async (roomFollows) => await ipcRenderer.invoke(Handlers.SaveChatRoomFollows, roomFollows),
    saveMemoPosts: async (posts) => await ipcRenderer.invoke(Handlers.SaveMemoPosts, posts),
    saveMemoProfiles: async (profiles) => await ipcRenderer.invoke(Handlers.SaveMemoProfiles, profiles),
    saveMemoProfileImages: async (profiles) => await ipcRenderer.invoke(Handlers.SaveMemoProfileImages, profiles),
}
