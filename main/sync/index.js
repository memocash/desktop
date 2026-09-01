// Everything the app downloads from the index and stores, in one place, and
// all of it in main. The renderer used to run these syncs itself and hand the
// results to main to save; that made the renderer the writer of every row the
// signer later trusts, and a renderer that lied about a token output could
// steer the signer into burning it. Now the renderer asks for a sync by name
// and gets progress and a result back, and the only bytes that reach the
// database are the ones main fetched itself.
const {SyncAliases} = require("./aliases")
const {BlocksSubscription, SaveNewBlock, SyncBlock} = require("./blocks")
const {
    ChatFollowsSubscription, ChatPostsSubscription, SaveNewChatFollow, SaveNewChatPost, SyncChat, SyncChatFollows,
} = require("./chat")
const {SyncHistory} = require("./history")
const {ProfilesSubscription, SaveNewProfile, SyncLinkedProfiles, SyncProfileLinks, SyncProfiles} = require("./memo")
const {PostsSubscription, SaveNewPost, SyncNewPosts, SyncPosts} = require("./posts")
const {SyncSlp} = require("./slp")
const {FetchTransaction, SaveNewTx, TxsSubscription} = require("./txs")

// The subscriptions a window may hold, by the name the renderer asks for. Each
// one saves what the index pushes and then forwards the payload to the
// renderer, so a page hears about a change only once it is in the database.
// variables are the subscription's own; addresses are what the history rows
// are rebuilt for when a transaction or block arrives.
const Subscriptions = {
    txs: {
        query: TxsSubscription,
        save: async ({conf, data, variables, forward}) => {
            await SaveNewTx({conf, tx: data.addresses, addresses: variables.addresses})
            forward()
        },
    },
    blocks: {
        query: BlocksSubscription,
        save: async ({conf, data, addresses, forward}) => {
            await SaveNewBlock({conf, block: data.blocks, addresses})
            forward()
        },
    },
    profiles: {
        query: ProfilesSubscription,
        save: ({conf, data, forward}) => SaveNewProfile({conf, profile: data.profiles, forward}),
    },
    posts: {
        query: PostsSubscription,
        save: async ({conf, data, forward}) => {
            await SaveNewPost({conf, post: data.posts})
            forward()
        },
    },
    chatPosts: {
        query: ChatPostsSubscription,
        save: async ({conf, data, forward}) => {
            await SaveNewChatPost({conf, post: data.rooms})
            forward()
        },
    },
    chatFollows: {
        query: ChatFollowsSubscription,
        save: async ({conf, data, forward}) => {
            await SaveNewChatFollow({conf, roomFollow: data.room_follows})
            forward()
        },
    },
}

module.exports = {
    FetchTransaction,
    Subscriptions,
    SyncAliases,
    SyncBlock,
    SyncChat,
    SyncChatFollows,
    SyncHistory,
    SyncLinkedProfiles,
    SyncNewPosts,
    SyncPosts,
    SyncProfileLinks,
    SyncProfiles,
    SyncSlp,
}
