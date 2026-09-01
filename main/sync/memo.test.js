const test = require("node:test")
const assert = require("node:assert")

// The memo, post and chat syncs are orchestration: which index answers go to
// which table, in what order, and what the renderer hears when. The tables
// and the pic downloader are recorded stand-ins here, so each test reads as
// the sequence of saves a sync produced.
const saves = []
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
let linked = []
stub("../data/tables", {
    SaveMemoProfiles: async (conf, profiles) => saves.push(["profiles", profiles]),
    GetLinkedAddresses: async () => linked,
    SaveMemoPosts: async (conf, posts) => saves.push(["posts", posts]),
    SaveChatRoom: async (conf, room) => saves.push(["room", room]),
    SaveChatRoomFollows: async (conf, follows) => saves.push(["roomFollows", follows]),
    SaveTransactions: async (conf, txs) => saves.push(["txs", txs]),
    GenerateHistory: async (conf, addresses) => saves.push(["history", addresses]),
    SaveBlock: async (conf, block) => saves.push(["block", block]),
})
stub("../client/images", {
    SaveImagesFromProfiles: async (conf, profiles) => saves.push(["images", profiles]),
})
const {FakeGraphQL} = require("./fixture")
const {SaveNewProfile, SyncLinkedProfiles, SyncProfileLinks, SyncProfiles} = require("./memo")
const {SyncNewPosts, SyncPosts} = require("./posts")
const {SyncChat, SyncChatFollows} = require("./chat")
const {Subscriptions} = require("./index")

const conf = {Server: "https://index.test"}
const profile = (address, extra = {}) => ({lock: {address}, name: {name: address}, pic: {pic: "https://pic/" + address}, ...extra})

test.beforeEach(() => {
    saves.length = 0
    linked = []
})

test("a header sync stores the profiles and then their pics; a details sync stores only rows", async () => {
    const following = {tx_hash: "f", follow_lock: {address: "friend", profile: profile("friend")}}
    const answered = profile("one", {following: [following]})
    const graphQL = FakeGraphQL({data: {profiles: [answered]}})
    assert.strictEqual(await SyncProfiles({conf, addresses: ["one"], details: false, graphQL}), 1)
    assert.deepStrictEqual(saves.map(([table]) => table), ["profiles", "images"])
    // Every pic the follow lists will show is fetched, not just the profile's own.
    assert.deepStrictEqual(saves[1][1], [answered, profile("friend")])
    saves.length = 0
    assert.strictEqual(await SyncProfiles({conf, addresses: ["one"], details: true, graphQL}), 1)
    assert.deepStrictEqual(saves.map(([table]) => table), ["profiles"])
})

test("links are followed hop by hop until the cluster stops growing", async () => {
    // one links to two; two links to three; three links to nobody new.
    const links = {
        one: [{address: "one", parent_address: "two"}],
        two: [{address: "two", parent_address: "three"}],
        three: [{address: "two", parent_address: "three"}],
    }
    const graphQL = FakeGraphQL((request) => ({data: {profiles: request.variables.addresses.map(
        address => ({lock: {address}, links: links[address] || []}))}}))
    linked = ["one", "two", "three"]
    assert.deepStrictEqual(await SyncProfileLinks({conf, addresses: ["one"], graphQL}), ["one", "two", "three"])
    assert.deepStrictEqual(graphQL.calls.map(call => call.variables.addresses), [["one"], ["two", "three"]])
    assert.deepStrictEqual(saves.map(([table]) => table), ["profiles", "profiles"])
})

test("linked profiles are the cluster's links, then its profile fields and pics", async () => {
    linked = ["one", "old"]
    const graphQL = FakeGraphQL({data: {profiles: [profile("one"), profile("old")]}})
    assert.deepStrictEqual(await SyncLinkedProfiles({conf, addresses: ["one"], graphQL}), ["one", "old"])
    // Two rounds of links (the second reaches the older address), then the
    // profile fields of the whole cluster.
    assert.deepStrictEqual(saves.map(([table]) => table), ["profiles", "profiles", "profiles", "images"])
    assert.deepStrictEqual(graphQL.calls.map(call => call.variables.addresses), [["one"], ["old"], ["one", "old"]])
})

test("a pushed profile is forwarded once its rows are stored and again after its pic", async () => {
    const forwarded = []
    await SaveNewProfile({conf, profile: profile("one"), forward: () => forwarded.push(saves.map(([table]) => table))})
    assert.deepStrictEqual(forwarded, [["profiles"], ["profiles", "images"]])
})

test("the feed's posts go to their tables profiles first, room posts by room, pics last", async () => {
    const posts = [
        {tx_hash: "p1", lock: {address: "one", profile: profile("one")}, room: null},
        {tx_hash: "p2", lock: {address: "one", profile: profile("one")}, room: {name: "memo"}},
        {tx_hash: "p3", lock: {address: "two", profile: profile("two")}, room: {name: "memo"}},
    ]
    linked = ["one", "two"]
    const graphQL = FakeGraphQL((request) => request.query.includes("posts_newest") ?
        {data: {posts_newest: posts}} : {data: {profiles: []}})
    assert.strictEqual(await SyncNewPosts({conf, graphQL}), 3)
    assert.deepStrictEqual(saves.map(([table]) => table),
        ["profiles", "profiles", "profiles", "images", "posts", "room", "images"])
    // One profile per address, however many posts it has.
    assert.deepStrictEqual(saves[0][1].map(p => p.lock.address), ["one", "two"])
    assert.deepStrictEqual(saves[4][1].map(p => p.tx_hash), ["p1"])
    assert.deepStrictEqual(saves[5][1], {name: "memo", posts: [posts[1], posts[2]]})
})

test("post details are stored as the index returns them", async () => {
    const graphQL = FakeGraphQL({data: {posts: [{tx_hash: "p1"}]}})
    assert.strictEqual(await SyncPosts({conf, txHashes: ["p1"], graphQL}), 1)
    assert.deepStrictEqual(graphQL.calls[0].variables, {txHashes: ["p1"]})
    assert.deepStrictEqual(saves, [["posts", [{tx_hash: "p1"}]]])
    assert.strictEqual(await SyncPosts({conf, txHashes: [], graphQL}), 0)
})

test("a room's follows are taken from every profile in the answer", async () => {
    const graphQL = FakeGraphQL({data: {profiles: [{rooms: [{name: "a"}]}, {}, {rooms: [{name: "b"}]}]}})
    assert.strictEqual(await SyncChatFollows({conf, addresses: ["one", "two", "three"], graphQL}), 2)
    assert.deepStrictEqual(saves, [["roomFollows", [{name: "a"}, {name: "b"}]]])
})

test("a room sync stores the room and then the identities of whoever posted", async () => {
    const room = {name: "memo", posts: [{tx_hash: "p1", lock: {address: "one"}}, {tx_hash: "p2", lock: null}]}
    const graphQL = FakeGraphQL((request) => request.variables.room ? {data: {room}} : {data: {profiles: []}})
    assert.strictEqual(await SyncChat({conf, roomName: "memo", graphQL}), 2)
    assert.strictEqual(saves[0][0], "room")
    assert.deepStrictEqual(graphQL.calls[1].variables, {addresses: ["one"]})
})

test("every subscription stores its frame before the renderer hears it", async () => {
    const cases = [
        ["txs", {addresses: {hash: "tx1", outputs: []}}, {variables: {addresses: ["w"]}}, ["txs", "history"]],
        ["blocks", {blocks: {hash: "b1"}}, {addresses: ["w"]}, ["block", "history"]],
        ["posts", {posts: {tx_hash: "p1"}}, {}, ["posts"]],
        ["chatFollows", {room_follows: {name: "memo"}}, {}, ["roomFollows"]],
    ]
    for (const [kind, data, extra, expected] of cases) {
        saves.length = 0
        let heard
        await Subscriptions[kind].save({conf, data, ...extra, forward: () => heard = saves.map(([table]) => table)})
        assert.deepStrictEqual(heard, expected, kind)
    }
    // The history rows are rebuilt for the addresses the renderer named.
    saves.length = 0
    await Subscriptions.txs.save({conf, data: {addresses: {hash: "tx1"}}, variables: {addresses: ["w"]}, forward: () => {}})
    assert.deepStrictEqual(saves[1], ["history", ["w"]])
})
