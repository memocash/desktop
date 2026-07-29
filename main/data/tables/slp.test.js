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

const {SaveSlp} = require("./slp")
const {SaveTransactions} = require("./txs")

const conf = {}

const genesis = (hash, name) => ({
    hash, token_type: 1, decimals: 8, ticker: "TKN", name, doc_url: "https://token/" + hash,
})

// A token output, the mint baton for a token, and a plain output, which is the
// mix a real transaction's outputs arrive in.
const slpOutput = (index, amount, token = "tokenOne", name = "Token One") => ({
    index, amount: 546, lock: {address: "addrOne"}, script: "aa",
    slp: {amount, token_hash: token, genesis: genesis(token, name)},
})

const batonOutput = (index, token = "tokenOne", name = "Token One") => ({
    index, amount: 546, lock: {address: "addrOne"}, script: "bb",
    slp_baton: {token_hash: token, genesis: genesis(token, name)},
})

const plainOutput = (index) => ({index, amount: 1000, lock: {address: "addrOne"}, script: "cc"})

const rows = (table, order) =>
    db.prepare("SELECT * FROM " + table + " ORDER BY " + order).all().map(row => ({...row}))

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
})

test.afterEach(() => db.close())

test("a backfill stores each output's token amount and baton against its output index", async () => {
    await SaveSlp(conf, [{hash: "txOne", outputs: [slpOutput(1, 5000), batonOutput(2), plainOutput(3)]}])
    assert.deepStrictEqual(rows("slp_outputs", "`index`"),
        [{hash: "txOne", index: 1, token_hash: "tokenOne", amount: 5000}])
    assert.deepStrictEqual(rows("slp_batons", "`index`"),
        [{hash: "txOne", index: 2, token_hash: "tokenOne"}])
})

test("a backfill stores the genesis metadata of every token it sees", async () => {
    await SaveSlp(conf, [
        {hash: "txOne", outputs: [slpOutput(0, 1, "tokenOne", "Token One")]},
        {hash: "txTwo", outputs: [batonOutput(0, "tokenTwo", "Token Two")]},
    ])
    assert.deepStrictEqual(rows("slp_geneses", "hash"), [
        {hash: "tokenOne", token_type: 1, decimals: 8, ticker: "TKN", name: "Token One",
            doc_url: "https://token/tokenOne"},
        {hash: "tokenTwo", token_type: 1, decimals: 8, ticker: "TKN", name: "Token Two",
            doc_url: "https://token/tokenTwo"},
    ])
})

test("a backfill marks every transaction it was given as checked", async () => {
    await SaveSlp(conf, [{hash: "txOne", outputs: [plainOutput(0)]}, undefined,
        {hash: "txTwo", outputs: []}, {hash: "txOne", outputs: []}])
    assert.deepStrictEqual(rows("slp_checks", "hash").map(row => row.hash), ["txOne", "txTwo"])
})

// slp_outputs and slp_batons ignore a repeated output, so the first amount
// offered for an output is the one kept.
test("an output offered twice keeps the amount it was first given", async () => {
    await SaveSlp(conf, [
        {hash: "txOne", outputs: [slpOutput(1, 5000)]},
        {hash: "txOne", outputs: [slpOutput(1, 9999)]},
    ])
    assert.deepStrictEqual(rows("slp_outputs", "`index`").map(row => row.amount), [5000])
})

// slp_geneses replaces instead, so a token whose metadata arrives again keeps
// the newer copy.
test("a genesis seen again replaces the metadata stored for its token", async () => {
    await SaveSlp(conf, [
        {hash: "txOne", outputs: [slpOutput(0, 1, "tokenOne", "Old Name")]},
        {hash: "txTwo", outputs: [slpOutput(0, 1, "tokenOne", "New Name")]},
    ])
    assert.deepStrictEqual(rows("slp_geneses", "hash").map(row => row.name), ["New Name"])
})

test("a token output and its baton on the same transaction are stored side by side", async () => {
    await SaveSlp(conf, [{hash: "txOne", outputs: [slpOutput(1, 100), batonOutput(1)]}])
    assert.deepStrictEqual(rows("slp_outputs", "`index`"),
        [{hash: "txOne", index: 1, token_hash: "tokenOne", amount: 100}])
    assert.deepStrictEqual(rows("slp_batons", "`index`"),
        [{hash: "txOne", index: 1, token_hash: "tokenOne"}])
})

// The sync's own transaction save carries the same SLP fields, and writes them
// through the same collector as the backfill.
test("a synced transaction stores the SLP rows of its outputs", async () => {
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [slpOutput(0, 7000), batonOutput(1, "tokenTwo", "Token Two"), plainOutput(2)],
    }])
    assert.deepStrictEqual(rows("slp_outputs", "`index`"),
        [{hash: "txOne", index: 0, token_hash: "tokenOne", amount: 7000}])
    assert.deepStrictEqual(rows("slp_batons", "`index`"),
        [{hash: "txOne", index: 1, token_hash: "tokenTwo"}])
    assert.deepStrictEqual(rows("slp_geneses", "hash").map(row => row.hash), ["tokenOne", "tokenTwo"])
    // Every output was stored, SLP or not, and the tx needs no backfill check.
    assert.strictEqual(rows("outputs", "`index`").length, 3)
    assert.deepStrictEqual(rows("slp_checks", "hash"), [{hash: "txOne"}])
})

test("a synced transaction with no SLP outputs stores no SLP rows", async () => {
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [plainOutput(0)],
    }])
    assert.strictEqual(rows("slp_outputs", "hash").length, 0)
    assert.strictEqual(rows("slp_batons", "hash").length, 0)
    assert.strictEqual(rows("slp_geneses", "hash").length, 0)
})
