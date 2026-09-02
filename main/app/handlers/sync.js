const {ipcMain} = require("../ipc");
const {Subscribe, CloseSocket} = require("../../client/graphql");
const {Handlers, Listeners} = require("../../common/util");
const {eConf} = require("../window");
const {
    FetchTransaction, Subscriptions, SyncAliases, SyncBlock, SyncChat, SyncChatFollows, SyncHistory,
    SyncLinkedProfiles, SyncNewPosts, SyncPosts, SyncProfileLinks, SyncProfiles, SyncSlp,
} = require("../../sync");

// The renderer's way of asking for data from the index. Each handler runs the
// whole sync - fetch, store, regenerate - in main and answers with a summary;
// a renderer that wants to see the result reads it back through the usual
// Get handlers, the same as anything else in the database.

// Progress goes back on a channel named by the request, so two syncs of the
// same kind running at once - a profile modal and the feed, say - don't hear
// each other's rounds.
const reporter = (e, id) => (progress) =>
    !e.sender.isDestroyed() && e.sender.send(Listeners.SyncProgressPrefix + id, progress)

const SyncHandlers = () => {
    ipcMain.handle(Handlers.SyncHistory, (e, {id, addresses}) =>
        SyncHistory({conf: eConf(e), addresses, report: reporter(e, id)}))
    ipcMain.handle(Handlers.SyncSlp, (e, {id, addresses}) =>
        SyncSlp({conf: eConf(e), addresses, report: reporter(e, id)}))
    ipcMain.handle(Handlers.SyncBlock, (e) => SyncBlock({conf: eConf(e)}))
    ipcMain.handle(Handlers.SyncAliases, (e, {addresses}) => SyncAliases({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.SyncProfiles, (e, {addresses, details}) =>
        SyncProfiles({conf: eConf(e), addresses, details}))
    ipcMain.handle(Handlers.SyncProfileLinks, (e, {addresses}) => SyncProfileLinks({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.SyncLinkedProfiles, (e, {addresses}) => SyncLinkedProfiles({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.SyncPosts, (e, {txHashes}) => SyncPosts({conf: eConf(e), txHashes}))
    ipcMain.handle(Handlers.SyncNewPosts, (e) => SyncNewPosts({conf: eConf(e)}))
    ipcMain.handle(Handlers.SyncChat, (e, {roomName}) => SyncChat({conf: eConf(e), roomName}))
    ipcMain.handle(Handlers.SyncChatFollows, (e, {addresses}) => SyncChatFollows({conf: eConf(e), addresses}))
    ipcMain.handle(Handlers.FetchTransaction, (e, {hash}) => FetchTransaction({conf: eConf(e), hash}))
    // A subscription is one of the named kinds in main/sync, never a query
    // the renderer wrote. Its frames are stored before the renderer hears
    // them, on the same data/open/close channels the renderer's reconnect
    // loop has always listened on. The window half of the socket's name
    // comes from the sender, so one window's subscriptions are never
    // reachable by another window's ids.
    ipcMain.on(Handlers.SyncListen, (e, {id, kind, variables, addresses}) => {
        const subscription = Subscriptions[kind]
        if (!subscription) {
            console.log("sync: unknown subscription " + kind)
            return
        }
        const conf = eConf(e)
        const send = (channel, data) => !e.sender.isDestroyed() && e.sender.send(channel, data)
        Subscribe({
            network: conf, windowId: e.sender.id, id, query: subscription.query, variables,
            callback: (data) => subscription.save({
                conf, data, variables, addresses,
                forward: () => send(Listeners.SyncDataPrefix + id, data),
            }).catch((err) => {
                console.log("sync: storing a " + kind + " subscription frame failed")
                console.log(err)
            }),
            onopen: (data) => send(Listeners.SyncOpenPrefix + id, data),
            onclose: (data) => send(Listeners.SyncClosePrefix + id, data),
        })
    })
    ipcMain.on(Handlers.SyncListenClose, (e, {id}) => CloseSocket({windowId: e.sender.id, id}))
}

module.exports = {
    SyncHandlers: SyncHandlers,
}
