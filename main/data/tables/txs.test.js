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

const {GetAddressSyncs, SaveAddressSync} = require("./txs")

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
