const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes} = require("../schema");

// Same node:sqlite fixture as the memo_post tests: swap Select and Insert
// before the query module destructures them, so these run the production SQL
// against real rows.
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

const {GetAddressSyncs, GetTransaction, SaveAddressSync, SaveTransactions} = require("./txs")

const Address = "walletAddress"
const conf = {}

// Display hashes, which is what the index returns and what these compare
// wrongly if the reversal is dropped: as display strings "01ff.." sorts after
// "00ff..", but the index orders them by the reversed bytes it stores, where
// "..ff00" comes after "..ff01".
const HashLow = "01" + "ff".repeat(30) + "01"
const HashHigh = "00" + "ff".repeat(30) + "02"

const tx = (hash, seen) => ({hash, seen})

test.beforeEach(() => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
})

test.afterEach(() => db.close())

test("an address with no sync yet has no starting point", async () => {
    assert.deepStrictEqual(await GetAddressSyncs(conf, [Address]), [])
})

test("the sync resumes from the last transaction of the page, whatever order it arrived in", async () => {
    await SaveAddressSync(conf, Address, [
        tx("txTwo", "2026-01-23T20:30:07-08:00"),
        tx("txThree", "2026-01-23T20:54:25-08:00"),
        tx("txOne", "2026-01-23T20:28:35-08:00"),
    ])
    assert.deepStrictEqual(await GetAddressSyncs(conf, [Address]), [
        {address: Address, seen: "2026-01-23T20:54:25-08:00", tx_hash: "txThree"},
    ])
})

test("transactions the index saw at the same time break the tie the way the index orders them", async () => {
    const seen = "2026-01-23T20:30:07-08:00"
    await SaveAddressSync(conf, Address, [tx(HashHigh, seen), tx(HashLow, seen)])
    const [sync] = await GetAddressSyncs(conf, [Address])
    assert.strictEqual(sync.tx_hash, HashHigh)
})

test("a page of older transactions doesn't move the sync backwards", async () => {
    await SaveAddressSync(conf, Address, [tx("txTwo", "2026-01-23T20:54:25-08:00")])
    const sync = await SaveAddressSync(conf, Address, [tx("txOne", "2026-01-23T20:28:35-08:00")])
    assert.strictEqual(sync.tx_hash, "txTwo")
    assert.deepStrictEqual(await GetAddressSyncs(conf, [Address]), [
        {address: Address, seen: "2026-01-23T20:54:25-08:00", tx_hash: "txTwo"},
    ])
})

test("a transaction the index hasn't dated can't become the starting point", async () => {
    assert.strictEqual(await SaveAddressSync(conf, Address, [tx("txOne", "0001-01-01T00:00:00Z")]), undefined)
    assert.deepStrictEqual(await GetAddressSyncs(conf, [Address]), [])
})

test("each address keeps its own starting point", async () => {
    await SaveAddressSync(conf, Address, [tx("txOne", "2026-01-23T20:28:35-08:00")])
    await SaveAddressSync(conf, "changeAddress", [tx("txTwo", "2026-01-24T04:21:00-08:00")])
    assert.deepStrictEqual(await GetAddressSyncs(conf, [Address]), [
        {address: Address, seen: "2026-01-23T20:28:35-08:00", tx_hash: "txOne"},
    ])
})

// A page of transactions goes out as batched multi-row inserts rather than a
// statement per row, so these check the rows that reach the tables are the ones
// the individual inserts used to write.
const fullTx = (hash, {seen = "2026-01-23T20:30:07-08:00", amount = 546, block = "blockOne"} = {}) => ({
    hash, seen, raw: "aabb", slp: null,
    inputs: [{index: 0, prev_hash: "prev" + hash, prev_index: 3}],
    outputs: [{index: 0, amount, lock: {address: Address}, script: "cc"},
        {index: 1, amount: 0, lock: null, script: "dd"}],
    blocks: block ? [{block: {hash: block, timestamp: "2026-01-23T21:00:00-08:00", height: 800001}}] : undefined,
})

const rows = (table, order) =>
    db.prepare("SELECT * FROM " + table + " ORDER BY " + order).all().map(row => ({...row}))

test("a transaction fills a row in each of the tables that describe it", async () => {
    await SaveTransactions(conf, [fullTx("txOne")])
    assert.deepStrictEqual(rows("txs", "hash"), [{hash: "txOne"}])
    assert.deepStrictEqual(rows("tx_seens", "hash"), [{hash: "txOne", timestamp: "2026-01-23T20:30:07-08:00"}])
    assert.deepStrictEqual(rows("inputs", "hash"),
        [{hash: "txOne", index: 0, prev_hash: "prevtxOne", prev_index: 3}])
    assert.strictEqual(rows("outputs", "`index`").length, 2)
    assert.deepStrictEqual(rows("block_txs", "tx_hash"), [{block_hash: "blockOne", tx_hash: "txOne"}])
    assert.deepStrictEqual(rows("slp_checks", "hash"), [{hash: "txOne", validity: "NOT_SLP"}])
})

test("an output with no lock is recorded against an unknown address", async () => {
    await SaveTransactions(conf, [fullTx("txOne")])
    assert.deepStrictEqual(rows("outputs", "`index`").map(row => row.address), [Address, "unknown"])
})

// The index returns a transaction both as an address's own and as the spend of
// another output, so a page carries the same rows several times over.
test("a transaction repeated within a page is stored once", async () => {
    await SaveTransactions(conf, [fullTx("txOne"), fullTx("txTwo"), fullTx("txOne")])
    assert.deepStrictEqual(rows("txs", "hash").map(row => row.hash), ["txOne", "txTwo"])
    assert.strictEqual(rows("outputs", "hash").length, 4)
    assert.deepStrictEqual(rows("blocks", "hash").map(row => row.hash), ["blockOne"])
})

test("an output offered twice in a page keeps the last value, as a replace would", async () => {
    await SaveTransactions(conf, [fullTx("txOne", {amount: 546}), fullTx("txOne", {amount: 999})])
    assert.strictEqual(rows("outputs", "`index`")[0].value, 999)
})

test("a trimmed transaction writes only the rows it has", async () => {
    await SaveTransactions(conf, [tx("txOne", "2026-01-23T20:30:07-08:00")])
    assert.deepStrictEqual(rows("txs", "hash"), [{hash: "txOne"}])
    assert.strictEqual(rows("tx_raws", "hash").length, 0)
    assert.strictEqual(rows("outputs", "hash").length, 0)
    assert.strictEqual(rows("slp_checks", "hash").length, 0)
})

test("a transaction the index hasn't dated gets no seen time", async () => {
    await SaveTransactions(conf, [fullTx("txOne", {seen: "0001-01-01T00:00:00Z"})])
    assert.strictEqual(rows("tx_seens", "hash").length, 0)
})

test("holes in the page are skipped", async () => {
    await SaveTransactions(conf, [fullTx("txOne"), undefined, fullTx("txTwo")])
    assert.strictEqual(rows("txs", "hash").length, 2)
})

// The transaction window shows what each input spends, tokens included: an
// input's joined parent output carries that output's SLP annotation, the
// genesis ticker/decimals to format it with, and the parent tx's verdict. The
// tx's own verdict rides along at the top level - null when never checked, so
// an unchecked claim reads unverified rather than clean.
test("a transaction's inputs carry their parents' tokens and its own verdict rides along", async () => {
    const genesis = {hash: "tokenOne", token_type: 1, decimals: 2, ticker: "TKN", name: "Token", doc_url: ""}
    const parent = {
        hash: "txParent", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", slp: {validity: "VALID"},
        inputs: [],
        outputs: [{index: 1, amount: 546, lock: {address: Address}, script: "cc",
            slp: {token_hash: "tokenOne", amount: 12345, genesis}}],
    }
    const child = {
        hash: "txChild", seen: "2026-01-23T20:31:07-08:00", raw: "ccdd",
        inputs: [{index: 0, prev_hash: "txParent", prev_index: 1}],
        outputs: [{index: 0, amount: 0, lock: null, script: "6a"}],
    }
    await SaveTransactions(conf, [parent, child])
    const tx = await GetTransaction(conf, "txChild")
    const output = tx.inputs[0].output
    assert.strictEqual(output.slp_token_hash, "tokenOne")
    assert.strictEqual(output.slp_amount, 12345n)
    assert.strictEqual(output.slp_ticker, "TKN")
    assert.strictEqual(output.slp_decimals, 2)
    assert.strictEqual(output.slp_validity, "VALID")
    // The child was saved by a query that never asked for a verdict: its own
    // validity is null (unverified), never defaulted.
    assert.strictEqual(tx.slp_validity, null)
    assert.strictEqual((await GetTransaction(conf, "txParent")).slp_validity, "VALID")
})

// SQLite binds at most 32766 variables to one statement. Outputs take five
// columns each, so a page of this size has to be split across statements or it
// fails with "too many SQL variables".
test("a page past the bound-variable limit is split into statements that fit", async () => {
    const transactions = []
    for (let i = 0; i < 5000; i++) {
        transactions.push(fullTx("tx" + i, {block: "block" + (i % 3)}))
    }
    await SaveTransactions(conf, transactions)
    assert.strictEqual(rows("txs", "hash").length, 5000)
    assert.strictEqual(rows("outputs", "hash").length, 10000)
    assert.strictEqual(rows("inputs", "hash").length, 5000)
    assert.strictEqual(rows("blocks", "hash").length, 3)
})
