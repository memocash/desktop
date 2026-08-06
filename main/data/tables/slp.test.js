const test = require("node:test");
const assert = require("node:assert");
const {DatabaseSync} = require("node:sqlite");
const {Definitions, Indexes} = require("../schema");

// Same node:sqlite fixture as the other table tests: swap the query helpers
// before the modules destructure them, so these run the production SQL against
// real rows.
const sqlite = require("../sqlite")
const {SafeRow} = require("../big_ints")
let db
// Reads mirror the worker: everything comes out as BigInt so nothing rounds,
// and SafeRow hands back numbers wherever a number is exact.
sqlite.Select = async (conf, name, query, variables = []) => {
    const statement = db.prepare(query)
    statement.setReadBigInts(true)
    return statement.all(...variables).map(row => SafeRow({...row}))
}
sqlite.Insert = async (conf, name, query, variables = []) => db.prepare(query).run(...variables)
sqlite.InsertBatch = async (conf, name, statements) => {
    for (const {query, variables = []} of statements) {
        db.prepare(query).run(...variables)
    }
}

const {GetAddressTokenBalances, GetTokenBalances, GetUncheckedSlpTxs, SaveSlp} = require("./slp")
const {GetOutput, GetUtxos, SaveTransactions} = require("./txs")
const {GetNotifications} = require("./notifications")

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

// Amounts are uint64 on chain. Stored as signed 64-bit two's-complement -
// exact, with no string column - and handed back as BigInts by every read.
const Uint64Max = 18446744073709551615n
const PastFloat = 9007199254740993n // 2^53 + 1: the first integer a float misses

test("a uint64 amount round-trips exactly from save to every read", async () => {
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [slpOutput(0, Uint64Max), slpOutput(1, PastFloat), slpOutput(2, 5000)],
    }])
    // On disk the top half of the range is its two's-complement negative.
    const stored = db.prepare("SELECT amount FROM slp_outputs ORDER BY `index`")
    stored.setReadBigInts(true)
    assert.deepStrictEqual(stored.all().map(row => row.amount), [-1n, PastFloat, 5000n])
    // Every read hands back the on-chain amount, always as a BigInt.
    const utxos = await GetUtxos(conf, ["addrOne"])
    const amounts = new Map(utxos.map(utxo => [utxo.index, utxo.slp_amount]))
    assert.strictEqual(amounts.get(0), Uint64Max)
    assert.strictEqual(amounts.get(1), PastFloat)
    assert.strictEqual(amounts.get(2), 5000n)
    const output = await GetOutput(conf, "txOne", 0)
    assert.strictEqual(output.slp_amount, Uint64Max)
    // The genesis type rides along, which is what the signer checks the
    // OP_RETURN's declared type against.
    assert.strictEqual(output.slp_token_type, 1)
    // An output carrying no tokens is untouched by the decoding.
    await SaveTransactions(conf, [{
        hash: "txTwo", seen: "2026-01-23T20:30:08-08:00", raw: "ccdd", inputs: [],
        outputs: [plainOutput(0)],
    }])
    assert.strictEqual((await GetOutput(conf, "txTwo", 0)).slp_amount, null)
})

test("token balances sum exactly past every float and int64 boundary", async () => {
    // Two coins of uint64 max together overflow even sqlite's own SUM
    // accumulator, which answers "integer overflow" where a BigInt keeps
    // counting.
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [slpOutput(0, Uint64Max), slpOutput(1, Uint64Max), slpOutput(2, 7)],
    }])
    const balances = await GetTokenBalances(conf, ["addrOne"])
    assert.strictEqual(balances.length, 1)
    assert.strictEqual(balances[0].amount, 2n * Uint64Max + 7n)
    assert.strictEqual(balances[0].utxo_count, 3)
    assert.strictEqual(balances[0].token_type, 1)
    const byAddress = await GetAddressTokenBalances(conf, ["addrOne"])
    assert.strictEqual(byAddress.length, 1)
    assert.strictEqual(byAddress[0].amount, 2n * Uint64Max + 7n)
    assert.strictEqual(byAddress[0].address, "addrOne")
})

// The exactness sweep in the sqlite worker deletes a suspect row, unmarks its
// transaction, and queues it in slp_repairs. This picks up from that state:
// the transaction's token output is already spent, which keeps it out of the
// UTXO half of the unchecked query, and the repair queue is what still brings
// it back.
test("a repair-queued transaction is re-fetched and restored even when fully spent", async () => {
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [slpOutput(0, 5000)],
    }])
    db.prepare("INSERT INTO inputs (hash, `index`, prev_hash, prev_index) VALUES (?, ?, ?, ?)")
        .run("txSpend", 0, "txOne", 0)
    // What the sweep leaves behind: the SLP row and its checked mark gone, the
    // hash queued for repair.
    db.prepare("DELETE FROM slp_outputs WHERE hash = ?").run("txOne")
    db.prepare("DELETE FROM slp_checks WHERE hash = ?").run("txOne")
    db.prepare("INSERT INTO slp_repairs (hash) VALUES (?)").run("txOne")

    // Spent, so the UTXO half of the query cannot see it; the repair queue can.
    const unchecked = await GetUncheckedSlpTxs(conf, ["addrOne"])
    assert.deepStrictEqual(unchecked.map(row => row.hash), ["txOne"])

    // The backfill's save restores the exact row, marks the transaction
    // checked, and retires the repair - so the queue drains rather than
    // re-fetching forever.
    await SaveSlp(conf, [{hash: "txOne", outputs: [slpOutput(0, Uint64Max)]}])
    const stored = db.prepare("SELECT amount FROM slp_outputs WHERE hash = ?")
    stored.setReadBigInts(true)
    assert.deepStrictEqual(stored.all("txOne").map(row => row.amount), [-1n])
    assert.deepStrictEqual(rows("slp_repairs", "hash"), [])
    assert.deepStrictEqual(await GetUncheckedSlpTxs(conf, ["addrOne"]), [])
})

test("a token notification reports the exact received amount, however large", async () => {
    // A received transfer whose outputs include a top-half amount - stored as
    // its two's-complement negative, which SQL's own SUM would read as -1.
    await SaveTransactions(conf, [{
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
        outputs: [slpOutput(1, Uint64Max), slpOutput(2, 7)],
    }])
    const notifications = await GetNotifications(conf, ["addrOne"])
    const token = notifications.find(notification => notification.type === "token")
    assert.strictEqual(token.amount, Uint64Max + 7n)
    assert.strictEqual(token.token_hash, "tokenOne")
    assert.strictEqual(token.ticker, "TKN")
})
