const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes} = require("../schema");

// The table queries reach the database through data/sqlite's worker. Swap in
// a node:sqlite fixture before the query modules destructure Select, so these
// tests run the production SQL
// (including the grouping MaxFollows/MaxChatRoomFollows choose) against real
// rows under a plain `node --test`.
const sqlite = require("../sqlite")
let db
sqlite.Select = async (conf, name, query, variables = []) =>
    db.prepare(query).all(...variables).map(row => ({...row}))

const {GetChatFollows, GetAddressesRoomFollowCount, GetRoomFollows} = require("../tables/memo_chat")
const {GetFollowing, GetFollowers} = require("../tables/memo_follow")

// One wallet identity - A and B are linked addresses of the same person - and
// the people it follows. P1 and P2 are one identity too, so a follow of either
// is a follow of that person.
const A = "addressA"
const B = "addressB"
const P1 = "personOne"
const P2 = "personTwo"
const Follower = "followerAddress"

const conf = {}
const cluster = [A, B]

// Height decides which transaction is the newest; an unconfirmed one (no block)
// counts as newer than any confirmed one, matching how the app orders them.
const Blocks = [["block100", 100, "2024-01-01T00:00:00Z"], ["block200", 200, "2024-06-01T00:00:00Z"]]

const link = (child, parent, suffix) => {
    db.prepare("INSERT INTO link_requests (tx_hash, address, parent_address) VALUES (?, ?, ?)")
        .run("request" + suffix, child, parent)
    db.prepare("INSERT INTO link_accepts (tx_hash, request_tx_hash) VALUES (?, ?)")
        .run("accept" + suffix, "request" + suffix)
}

// height null leaves the transaction unconfirmed.
const confirm = (txHash, height) => {
    db.prepare("INSERT INTO txs (hash) VALUES (?)").run(txHash)
    db.prepare("INSERT INTO tx_seens (hash, timestamp) VALUES (?, ?)").run(txHash, "2024-01-01T00:00:00Z")
    if (height !== null) {
        db.prepare("INSERT INTO block_txs (tx_hash, block_hash) VALUES (?, ?)").run(txHash, "block" + height)
    }
}

const roomFollow = (address, room, unfollow, txHash, height) => {
    db.prepare("INSERT INTO memo_chat_follow (address, room, unfollow, tx_hash) VALUES (?, ?, ?, ?)")
        .run(address, room, unfollow, txHash)
    confirm(txHash, height)
}

const follow = (address, followAddress, unfollow, txHash, height) => {
    db.prepare("INSERT INTO memo_follows (address, follow_address, unfollow, tx_hash) VALUES (?, ?, ?, ?)")
        .run(address, followAddress, unfollow, txHash)
    confirm(txHash, height)
}

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
    for (const [hash, height, timestamp] of Blocks) {
        db.prepare("INSERT INTO blocks (hash, height, timestamp) VALUES (?, ?, ?)").run(hash, height, timestamp)
    }
    link(B, A, "AB")
})

test.afterEach(() => db.close())

const rooms = async () => (await GetChatFollows({conf, addresses: cluster})).map(row => row.room).sort()

test("a room left from one address of an identity is left for all of them", async () => {
    roomFollow(A, "left", 0, "joinTx", 100)
    roomFollow(B, "left", 1, "leaveTx", 200)
    assert.deepEqual(await rooms(), [])
})

test("a room rejoined from another address after leaving is in the list again", async () => {
    roomFollow(A, "rejoined", 1, "leaveTx", 100)
    roomFollow(B, "rejoined", 0, "joinTx", 200)
    const follows = await GetChatFollows({conf, addresses: cluster})
    assert.deepEqual(follows.map(row => row.room), ["rejoined"])
    // The row describes the transaction that decided it - B's join, not A's leave.
    assert.equal(follows[0].tx_hash, "joinTx")
    assert.equal(follows[0].address, B)
})

test("a room joined from two addresses of an identity is listed once", async () => {
    roomFollow(A, "shared", 0, "joinTxA", 100)
    roomFollow(B, "shared", 0, "joinTxB", 200)
    assert.deepEqual(await rooms(), ["shared"])
})

test("an unconfirmed leave supersedes a confirmed join from another address", async () => {
    roomFollow(A, "leaving", 0, "joinTx", 200)
    roomFollow(B, "leaving", 1, "leaveTx", null)
    assert.deepEqual(await rooms(), [])
})

test("the room count matches the rooms listed", async () => {
    roomFollow(A, "shared", 0, "joinTxA", 100)
    roomFollow(B, "shared", 0, "joinTxB", 200)
    roomFollow(A, "left", 0, "joinTx", 100)
    roomFollow(B, "left", 1, "leaveTx", 200)
    roomFollow(B, "kept", 0, "keptTx", 100)
    const count = await GetAddressesRoomFollowCount({conf, addresses: cluster})
    assert.deepEqual(await rooms(), ["kept", "shared"])
    assert.equal(count[0].count, 2)
})

test("a room's follower list still resolves each address on its own", async () => {
    roomFollow(A, "room", 0, "joinTxA", 100)
    roomFollow(B, "room", 0, "joinTxB", 200)
    const followers = await GetRoomFollows({conf, room: "room"})
    assert.deepEqual(followers.map(row => row.address).sort(), [A, B])
})

test("a person unfollowed from one address of an identity is unfollowed for all of them", async () => {
    follow(A, P1, 0, "followTx", 100)
    follow(B, P1, 1, "unfollowTx", 200)
    const following = await GetFollowing(conf, cluster)
    assert.deepEqual(following.map(row => row.follow_address), [])
})

test("a person refollowed from another address after unfollowing is followed again", async () => {
    follow(A, P1, 1, "unfollowTx", 100)
    follow(B, P1, 0, "followTx", 200)
    const following = await GetFollowing(conf, cluster)
    assert.deepEqual(following.map(row => row.follow_address), [P1])
    assert.equal(following[0].tx_hash, "followTx")
})

test("a person followed from two addresses of an identity is listed once", async () => {
    follow(A, P1, 0, "followTxA", 100)
    follow(B, P1, 0, "followTxB", 200)
    const following = await GetFollowing(conf, cluster)
    assert.deepEqual(following.map(row => row.follow_address), [P1])
})

test("a follower who unfollows another address of an identity is no longer a follower", async () => {
    link(P2, P1, "P")
    follow(Follower, P1, 0, "followTx", 100)
    follow(Follower, P2, 1, "unfollowTx", 200)
    const followers = await GetFollowers(conf, [P1, P2])
    assert.deepEqual(followers.map(row => row.address), [])
})

test("a follower of two addresses of an identity is listed once", async () => {
    link(P2, P1, "P")
    follow(Follower, P1, 0, "followTxOne", 100)
    follow(Follower, P2, 0, "followTxTwo", 200)
    const followers = await GetFollowers(conf, [P1, P2])
    assert.deepEqual(followers.map(row => row.address), [Follower])
})
