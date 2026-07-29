const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes} = require("../schema");

// Same node:sqlite fixture as the other table tests: swap the query helpers
// before the modules destructure them, so these run the production SQL against
// real rows.
const sqlite = require("../sqlite")
let db
sqlite.Select = async (conf, name, query, variables = []) =>
    db.prepare(query).all(...variables).map(row => ({...row}))
sqlite.Insert = async (conf, name, query, variables = []) => db.prepare(query).run(...variables)
sqlite.InsertBatch = async (conf, name, statements) => {
    for (const {query, variables = []} of statements) {
        db.prepare(query).run(...variables)
    }
}

const {SaveMemoProfiles} = require("./memo")
const {SaveMemoPosts} = require("./memo_post")

const conf = {}
const One = "addrOne"
const Two = "addrTwo"
const Three = "addrThree"

// Transactions arrive alongside every record; a trimmed one carries just the
// hash and the time the index saw it.
const tx = (hash) => ({hash, seen: "2026-01-23T20:30:07-08:00"})

const rows = (table, order) =>
    db.prepare("SELECT * FROM " + table + " ORDER BY " + order).all().map(row => ({...row}))

const hashes = (table, column, order) => rows(table, order).map(row => row[column])

// The fields a profile can carry. A profile reached through someone's follow
// list usually has only some of them set.
const profile = (address, {name, text, pic, posts, links, following, followers} = {}) => ({
    lock: {address},
    name: name ? {name, tx_hash: "name-" + address, tx: tx("nameTx-" + address)} : null,
    profile: text ? {text, tx_hash: "text-" + address, tx: tx("textTx-" + address)} : null,
    pic: pic ? {pic, tx_hash: "pic-" + address, tx: tx("picTx-" + address)} : null,
    posts: posts || null,
    links: links || null,
    following: following || null,
    followers: followers || null,
})

const follows = (address, nested, {unfollow = false} = {}) => ({
    tx_hash: "follow-" + address, unfollow, tx: tx("followTx-" + address),
    follow_lock: {address, profile: nested},
})

const followedBy = (address, nested, {unfollow = false} = {}) => ({
    tx_hash: "follower-" + address, unfollow, tx: tx("followerTx-" + address),
    lock: {address, profile: nested},
})

const post = (txHash, {text = "post text", likes = [], parent, replies} = {}) => ({
    tx_hash: txHash, text, tx: tx("postTx-" + txHash), likes, parent, replies,
})

const like = (txHash, address, tip) => ({
    tx_hash: txHash, lock: {address}, tip, tx: tx("likeTx-" + txHash),
})

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
})

test.afterEach(() => db.close())

test("a profile's name, text and picture are stored and its profile row points at them", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex", text: "Bio", pic: "https://pic"})])
    assert.deepStrictEqual(rows("profile_names", "tx_hash"),
        [{address: One, name: "Alex", tx_hash: "name-" + One}])
    assert.deepStrictEqual(rows("profile_texts", "tx_hash"),
        [{address: One, profile: "Bio", tx_hash: "text-" + One}])
    assert.deepStrictEqual(rows("profile_pics", "tx_hash"),
        [{address: One, pic: "https://pic", tx_hash: "pic-" + One}])
    assert.deepStrictEqual(rows("profiles", "address"),
        [{address: One, name: "name-" + One, profile: "text-" + One, pic: "pic-" + One}])
})

test("a profile with a name but no text or picture leaves those columns empty", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex"})])
    assert.deepStrictEqual(rows("profiles", "address"),
        [{address: One, name: "name-" + One, profile: "", pic: ""}])
    assert.strictEqual(rows("profile_texts", "tx_hash").length, 0)
})

test("a profile that set none of those fields gets no profile row", async () => {
    await SaveMemoProfiles(conf, [profile(One)])
    assert.strictEqual(rows("profiles", "address").length, 0)
})

test("a profile without an address is skipped rather than stored", async () => {
    await SaveMemoProfiles(conf, [{lock: null, name: {name: "Alex", tx_hash: "x", tx: tx("y")}},
        profile(One, {name: "Alex"})])
    assert.deepStrictEqual(hashes("profiles", "address", "address"), [One])
})

test("the profiles a profile follows are stored along with the follow", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex",
        following: [follows(Two, profile(Two, {name: "Blair"}))]})])
    assert.deepStrictEqual(rows("memo_follows", "tx_hash"),
        [{address: One, follow_address: Two, unfollow: 0, tx_hash: "follow-" + Two}])
    // The followed profile's own records were saved by the same pass.
    assert.deepStrictEqual(hashes("profile_names", "name", "address"), ["Alex", "Blair"])
    assert.deepStrictEqual(hashes("profiles", "address", "address"), [One, Two])
})

test("a follower is stored as following the profile it follows", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex",
        followers: [followedBy(Three, profile(Three, {name: "Casey"}))]})])
    assert.deepStrictEqual(rows("memo_follows", "tx_hash"),
        [{address: Three, follow_address: One, unfollow: 0, tx_hash: "follower-" + Three}])
    assert.deepStrictEqual(hashes("profiles", "address", "address"), [One, Three])
})

test("an unfollow is stored as one rather than dropped", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex",
        following: [follows(Two, profile(Two, {name: "Blair"}), {unfollow: true})]})])
    assert.deepStrictEqual(rows("memo_follows", "tx_hash").map(row => row.unfollow), [1])
})

// A profile carried inside someone's follow list usually has fewer fields set
// than the same profile asked for directly. The row for the level it was asked
// for has to be the one that survives.
test("a profile carried again deeper in the tree keeps the fields it was asked for", async () => {
    const nested = profile(Two, {name: "Blair"})
    await SaveMemoProfiles(conf, [
        profile(One, {name: "Alex", following: [follows(Two, nested)]}),
        profile(Two, {name: "Blair", text: "Bio", pic: "https://pic"}),
    ])
    assert.deepStrictEqual(rows("profiles", "address"), [
        {address: One, name: "name-" + One, profile: "", pic: ""},
        {address: Two, name: "name-" + Two, profile: "text-" + Two, pic: "pic-" + Two},
    ])
})

test("a profile's posts are stored against its own address", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex", posts: [post("postOne")]})])
    assert.deepStrictEqual(rows("memo_posts", "tx_hash"),
        [{address: One, text: "post text", tx_hash: "postOne"}])
})

test("the posts of a followed profile are stored against that profile", async () => {
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex",
        following: [follows(Two, profile(Two, {name: "Blair", posts: [post("postTwo")]}))]})])
    assert.deepStrictEqual(rows("memo_posts", "tx_hash"),
        [{address: Two, text: "post text", tx_hash: "postTwo"}])
})

test("a link request, the accept answering it and the revoke ending it are all stored", async () => {
    const links = [{
        tx_hash: "request", address: Two, parent_address: One, message: "please", tx: tx("requestTx"),
        accepts: [{tx_hash: "accept", request_tx_hash: "request", message: "ok", tx: tx("acceptTx"),
            revokes: [{tx_hash: "revoke", accept_tx_hash: "accept", message: "no", tx: tx("revokeTx")}]}],
    }]
    await SaveMemoProfiles(conf, [profile(One, {name: "Alex", links})])
    assert.deepStrictEqual(rows("link_requests", "tx_hash"),
        [{tx_hash: "request", address: Two, parent_address: One, message: "please"}])
    assert.deepStrictEqual(rows("link_accepts", "tx_hash"),
        [{tx_hash: "accept", request_tx_hash: "request", message: "ok"}])
    assert.deepStrictEqual(rows("link_revokes", "tx_hash"),
        [{tx_hash: "revoke", accept_tx_hash: "accept", message: "no"}])
})

// Every record's transaction is what the queries later date it by, so one has
// to be stored for each level of the tree, not just the top.
test("the transaction behind every record in the tree is stored", async () => {
    await SaveMemoProfiles(conf, [profile(One, {
        name: "Alex", text: "Bio", pic: "https://pic",
        posts: [post("postOne")],
        links: [{tx_hash: "request", address: Two, parent_address: One, message: "m", tx: tx("requestTx"),
            accepts: [{tx_hash: "accept", request_tx_hash: "request", message: "m", tx: tx("acceptTx")}]}],
        following: [follows(Two, profile(Two, {name: "Blair"}))],
        followers: [followedBy(Three, profile(Three, {name: "Casey"}))],
    })])
    assert.deepStrictEqual(hashes("txs", "hash", "hash"), [
        "acceptTx", "followTx-" + Two, "followerTx-" + Three,
        "nameTx-" + One, "nameTx-" + Three, "nameTx-" + Two,
        "picTx-" + One, "postTx-postOne", "requestTx", "textTx-" + One,
    ])
    // and the times the index saw them, which the post and profile queries sort on
    assert.strictEqual(rows("tx_seens", "hash").length, 10)
})

test("a page of posts stores each post with its parent and its replies", async () => {
    await SaveMemoPosts(conf, [
        {...post("postOne", {parent: {...post("parentOne"), lock: {address: Two}}}), lock: {address: One}},
        {...post("postTwo", {replies: [{...post("replyOne"), lock: {address: Three}}]}), lock: {address: One}},
    ])
    assert.deepStrictEqual(rows("memo_posts", "tx_hash"), [
        {address: Two, text: "post text", tx_hash: "parentOne"},
        {address: One, text: "post text", tx_hash: "postOne"},
        {address: One, text: "post text", tx_hash: "postTwo"},
        {address: Three, text: "post text", tx_hash: "replyOne"},
    ])
    assert.deepStrictEqual(rows("memo_replies", "child_tx_hash"), [
        {parent_tx_hash: "parentOne", child_tx_hash: "postOne"},
        {parent_tx_hash: "postTwo", child_tx_hash: "replyOne"},
    ])
})

test("a post's likes are stored against it with their tips", async () => {
    await SaveMemoPosts(conf, [{...post("postOne", {
        likes: [like("likeOne", Two, 500), like("likeTwo", Three, 0)]}), lock: {address: One}}])
    assert.deepStrictEqual(rows("memo_likes", "like_tx_hash"), [
        {address: Two, like_tx_hash: "likeOne", post_tx_hash: "postOne", tip: 500},
        {address: Three, like_tx_hash: "likeTwo", post_tx_hash: "postOne", tip: 0},
    ])
})

test("a post repeated within a page keeps the last copy of it", async () => {
    await SaveMemoPosts(conf, [
        {...post("postOne", {text: "first"}), lock: {address: One}},
        {...post("postOne", {text: "edited"}), lock: {address: One}},
    ])
    assert.deepStrictEqual(rows("memo_posts", "tx_hash").map(row => row.text), ["edited"])
})

test("the transactions behind posts and their likes are both stored", async () => {
    await SaveMemoPosts(conf, [{...post("postOne", {likes: [like("likeOne", Two, 500)]}), lock: {address: One}}])
    assert.deepStrictEqual(hashes("txs", "hash", "hash"), ["likeTx-likeOne", "postTx-postOne"])
})
