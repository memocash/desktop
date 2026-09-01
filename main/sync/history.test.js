const test = require("node:test")
const assert = require("node:assert")
const {Close, FakeGraphQL, Open, Rows} = require("./fixture")
const {PageSize, SyncHistory} = require("./history")

const conf = {Server: "https://index.test"}
const Address = "walletAddress"

// A wallet transaction as the index returns it, seen at a time that orders
// with its number so a page resumes where it should.
const tx = (n, {spends, address = Address} = {}) => ({
    hash: "tx" + String(n).padStart(6, "0"),
    seen: "2026-01-23T20:30:07-08:00".replace("20:30:07", new Date(1000 * n).toISOString().substr(11, 8)),
    raw: "aabb",
    slp: null,
    inputs: [],
    outputs: [{index: 0, amount: 1000, lock: {address}, script: "cc", spends}],
    blocks: [],
})

const page = (txs) => ({data: {address0: {address: Address, txs}}})

test.beforeEach(Open)
test.afterEach(Close)

test("a short page is the whole history: stored, positioned, and reported", async () => {
    const graphQL = FakeGraphQL(page([tx(1), tx(2), tx(3)]))
    const progress = []
    const result = await SyncHistory({conf, addresses: [Address], graphQL, report: (p) => progress.push(p)})
    assert.deepStrictEqual(result, {saved: 3, connected: true})
    assert.strictEqual(graphQL.calls.length, 1)
    // The first round starts from nothing.
    assert.deepStrictEqual(graphQL.calls[0].variables, {address0: Address, start0: null, tx0: ""})
    assert.strictEqual(Rows("txs").length, 3)
    assert.deepStrictEqual(Rows("slp_checks").map(row => row.validity), ["NOT_SLP", "NOT_SLP", "NOT_SLP"])
    assert.deepStrictEqual(Rows("address_syncs"), [{address: Address, seen: tx(3).seen, tx_hash: tx(3).hash}])
    // History rows were generated, so the History tab has something to show.
    assert.strictEqual(Rows("history").length, 3)
    assert.deepStrictEqual(progress, [{saved: 3}, {updated: true}])
})

test("a full page is followed by a request from the transaction it reached", async () => {
    const first = [...Array(PageSize).keys()].map(n => tx(n + 1))
    const graphQL = FakeGraphQL(page(first), page([tx(PageSize + 1)]))
    const progress = []
    const result = await SyncHistory({conf, addresses: [Address], graphQL, report: (p) => progress.push(p)})
    assert.deepStrictEqual(result, {saved: PageSize + 1, connected: true})
    assert.strictEqual(graphQL.calls.length, 2)
    const last = first[first.length - 1]
    assert.deepStrictEqual(graphQL.calls[1].variables, {address0: Address, start0: last.seen, tx0: last.hash})
    assert.strictEqual(Rows("txs").length, PageSize + 1)
    // The running total, not the round's count.
    assert.deepStrictEqual(progress.filter(p => p.saved).map(p => p.saved), [PageSize, PageSize + 1])
})

test("the transactions that spend an output arrive nested and are stored too", async () => {
    const spender = tx(9, {address: "someoneElse"})
    spender.inputs = [{index: 0, prev_hash: tx(1).hash, prev_index: 0}]
    const graphQL = FakeGraphQL(page([tx(1, {spends: [{tx: spender}]})]))
    const result = await SyncHistory({conf, addresses: [Address], graphQL})
    assert.strictEqual(result.saved, 2)
    assert.deepStrictEqual(Rows("inputs"), [{hash: spender.hash, index: 0, prev_hash: tx(1).hash, prev_index: 0}])
    // Only the address's own page moves its sync position.
    assert.deepStrictEqual(Rows("address_syncs").map(row => row.tx_hash), [tx(1).hash])
})

test("a later run resumes from the stored position", async () => {
    await SyncHistory({conf, addresses: [Address], graphQL: FakeGraphQL(page([tx(1), tx(2)]))})
    const graphQL = FakeGraphQL(page([]))
    const result = await SyncHistory({conf, addresses: [Address], graphQL})
    assert.deepStrictEqual(result, {saved: 0, connected: true})
    assert.deepStrictEqual(graphQL.calls[0].variables, {address0: Address, start0: tx(2).seen, tx0: tx(2).hash})
})

test("an index failure ends the sync as a disconnect, keeping what came before it", async () => {
    const first = [...Array(PageSize).keys()].map(n => tx(n + 1))
    const graphQL = FakeGraphQL(page(first), new Error("socket hang up"))
    const result = await SyncHistory({conf, addresses: [Address], graphQL})
    assert.deepStrictEqual(result, {saved: PageSize, connected: false, error: "socket hang up"})
    assert.strictEqual(Rows("txs").length, PageSize)
    // The page that landed positioned the address, so the next run carries
    // on from it rather than downloading it again.
    assert.deepStrictEqual(Rows("address_syncs").map(row => row.tx_hash), [first[first.length - 1].hash])
})

test("a GraphQL error list is reported as its messages", async () => {
    const graphQL = FakeGraphQL(() => {
        throw [{message: "bad query"}, {message: "and again"}]
    })
    const result = await SyncHistory({conf, addresses: [Address], graphQL})
    assert.deepStrictEqual(result, {saved: 0, connected: false, error: "bad query, and again"})
})

test("an address the index answers with null transactions is dropped, not fatal", async () => {
    const graphQL = FakeGraphQL({data: {
        address0: {address: Address, txs: null},
        address1: {address: "other", txs: [tx(1, {address: "other"})]},
    }})
    const result = await SyncHistory({conf, addresses: [Address, "other"], graphQL})
    assert.deepStrictEqual(result, {saved: 1, connected: true})
    // Neither address is asked again: one answered in full, the other not at all.
    assert.strictEqual(graphQL.calls.length, 1)
})
