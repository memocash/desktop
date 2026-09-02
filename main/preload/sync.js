const {ipcRenderer} = require("electron");
const {Handlers, Listeners} = require("../common/util/handlers");
const {GetId} = require("../common/util/id");

// A sync that reports as it goes: progress arrives on a channel named by this
// request until the invoke settles, then the listener goes with it.
const withProgress = async (channel, args, onProgress) => {
    const id = GetId()
    const listener = (e, progress) => typeof onProgress === "function" && onProgress(progress)
    ipcRenderer.on(Listeners.SyncProgressPrefix + id, listener)
    try {
        return await ipcRenderer.invoke(channel, {id, ...args})
    } finally {
        ipcRenderer.removeListener(Listeners.SyncProgressPrefix + id, listener)
    }
}

module.exports = {
    syncHistory: ({addresses, onProgress}) => withProgress(Handlers.SyncHistory, {addresses}, onProgress),
    syncSlp: ({addresses, onProgress}) => withProgress(Handlers.SyncSlp, {addresses}, onProgress),
    syncBlock: () => ipcRenderer.invoke(Handlers.SyncBlock),
    syncAliases: ({addresses}) => ipcRenderer.invoke(Handlers.SyncAliases, {addresses}),
    syncProfiles: ({addresses, details}) => ipcRenderer.invoke(Handlers.SyncProfiles, {addresses, details}),
    syncProfileLinks: ({addresses}) => ipcRenderer.invoke(Handlers.SyncProfileLinks, {addresses}),
    syncLinkedProfiles: ({addresses}) => ipcRenderer.invoke(Handlers.SyncLinkedProfiles, {addresses}),
    syncPosts: ({txHashes}) => ipcRenderer.invoke(Handlers.SyncPosts, {txHashes}),
    syncNewPosts: () => ipcRenderer.invoke(Handlers.SyncNewPosts),
    syncChat: ({roomName}) => ipcRenderer.invoke(Handlers.SyncChat, {roomName}),
    syncChatFollows: ({addresses}) => ipcRenderer.invoke(Handlers.SyncChatFollows, {addresses}),
    fetchTransaction: (hash) => ipcRenderer.invoke(Handlers.FetchTransaction, {hash}),
    // A main-owned subscription of one of the named kinds. The handler hears
    // each frame after main has stored it. Returns the function that closes
    // the subscription and drops the listeners with it.
    listenSync: ({kind, variables, addresses, handler, onopen, onclose}) => {
        const id = GetId()
        const listeners = [
            [Listeners.SyncDataPrefix + id, (e, data) => handler(data)],
            [Listeners.SyncClosePrefix + id, (e, data) => typeof onclose === "function" && onclose(data)],
            [Listeners.SyncOpenPrefix + id, (e, data) => typeof onopen === "function" && onopen(data)],
        ]
        for (const [channel, listener] of listeners) {
            ipcRenderer.on(channel, listener)
        }
        ipcRenderer.send(Handlers.SyncListen, {id, kind, variables, addresses})
        return () => {
            ipcRenderer.send(Handlers.SyncListenClose, {id})
            for (const [channel, listener] of listeners) {
                ipcRenderer.removeListener(channel, listener)
            }
        }
    },
}
