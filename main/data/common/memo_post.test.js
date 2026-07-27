const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes} = require("../schema");

// Same node:sqlite fixture as memo_follow.test.js: swap Select before the query
// module destructures it, so these run the production SQL against real rows.
const sqlite = require("../sqlite")
let db
sqlite.Select = async (conf, name, query, variables = []) =>
    db.prepare(query).all(...variables).map(row => ({...row}))

const {GetPost, GetPostReplies} = require("../tables/memo_post")

const Author = "authorAddress"
const Liker = "likerAddress"
const Post = "postTxHash"

const conf = {}
const userAddresses = [Author]

const post = (txHash, address) => {
    db.prepare("INSERT INTO memo_posts (address, text, tx_hash) VALUES (?, ?, ?)").run(address, "text", txHash)
    db.prepare("INSERT INTO tx_seens (hash, timestamp) VALUES (?, ?)").run(txHash, "2024-01-01T00:00:00Z")
}

const like = (txHash, tip) => {
    db.prepare("INSERT INTO memo_likes (address, like_tx_hash, post_tx_hash, tip) VALUES (?, ?, ?, ?)")
        .run(Liker, txHash, Post, tip)
}

const reply = (txHash) => {
    post(txHash, Liker)
    db.prepare("INSERT INTO memo_replies (parent_tx_hash, child_tx_hash) VALUES (?, ?)").run(Post, txHash)
}

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
    post(Post, Author)
})

test.afterEach(() => db.close())

// The replies join repeats each like row once per reply, so a tip total summed
// over the joined rows comes back multiplied by the reply count.
test("a post's tip total counts each tip once no matter how many replies it has", async () => {
    like("likeTx", 50000)
    reply("replyOneTx")
    reply("replyTwoTx")
    reply("replyThreeTx")
    const result = await GetPost({conf, txHash: Post, userAddresses})
    assert.strictEqual(result.tip_total, 50000)
    assert.strictEqual(result.like_count, 1)
    assert.strictEqual(result.reply_count, 3)
})

test("a post's tip total adds up every tip it received", async () => {
    like("likeOneTx", 100000)
    like("likeTwoTx", 100000)
    like("likeThreeTx", 10000)
    reply("replyOneTx")
    reply("replyTwoTx")
    const result = await GetPost({conf, txHash: Post, userAddresses})
    assert.strictEqual(result.tip_total, 210000)
    assert.strictEqual(result.like_count, 3)
})

// A caller's own join is another source of repeated rows.
test("a reply's tip total is unaffected by the parent join the replies query adds", async () => {
    reply("replyTx")
    db.prepare("INSERT INTO memo_likes (address, like_tx_hash, post_tx_hash, tip) VALUES (?, ?, ?, ?)")
        .run(Liker, "likeTx", "replyTx", 25000)
    const results = await GetPostReplies({conf, txHash: Post, userAddresses})
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].tip_total, 25000)
})

test("a post with no likes has no tip total", async () => {
    const result = await GetPost({conf, txHash: Post, userAddresses})
    assert.strictEqual(result.tip_total, null)
})
