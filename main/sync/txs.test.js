const test = require("node:test")
const assert = require("node:assert")
const {Close, FakeGraphQL, Open, Rows} = require("./fixture")
const {FetchTransaction, SaveNewTx} = require("./txs")

const conf = {Server: "https://index.test"}

test.beforeEach(Open)
test.afterEach(Close)

test("a fetched transaction is stored with its parents and read back with its inputs resolved", async () => {
    const graphQL = FakeGraphQL({data: {tx: {
        hash: "txChild", seen: "2026-01-23T20:31:07-08:00", raw: "ccdd",
        inputs: [{index: 0, prev_hash: "txParent", prev_index: 1,
            output: {index: 1, amount: 5000, script: "aa", lock: {address: "payer"}}}],
        outputs: [{index: 0, amount: 4000, script: "bb", lock: {address: "payee"}}],
        blocks: [],
    }}})
    const tx = await FetchTransaction({conf, hash: "txChild", graphQL})
    assert.deepStrictEqual(graphQL.calls[0].variables, {hash: "txChild"})
    assert.strictEqual(tx.inputs.length, 1)
    assert.strictEqual(tx.inputs[0].output.address, "payer")
    assert.strictEqual(tx.inputs[0].output.value, 5000)
    assert.strictEqual(tx.outputs[0].address, "payee")
    // Nothing about it is spendable: the query asked for no verdict, so the
    // outputs are stored unverified rather than marked clean.
    assert.strictEqual(tx.slp_validity, null)
    assert.strictEqual(Rows("slp_checks").length, 0)
    assert.deepStrictEqual(Rows("txs", "hash").map(row => row.hash), ["txChild", "txParent"])
})

test("a transaction the index does not know is read back empty", async () => {
    const tx = await FetchTransaction({conf, hash: "txNone", graphQL: FakeGraphQL({data: {tx: null}})})
    assert.strictEqual(tx.raw, undefined)
    assert.deepStrictEqual(tx.outputs, [])
    assert.strictEqual(Rows("txs").length, 0)
})

test("a pushed wallet transaction is stored and the history rows rebuilt", async () => {
    await SaveNewTx({conf, tx: {
        hash: "txOne", seen: "2026-01-23T20:30:07-08:00", raw: "aabb", slp: null, inputs: [],
        outputs: [{index: 0, amount: 1000, lock: {address: "walletAddress"}, script: "cc"}], blocks: [],
    }, addresses: ["walletAddress"]})
    assert.deepStrictEqual(Rows("slp_checks"), [{hash: "txOne", validity: "NOT_SLP"}])
    assert.deepStrictEqual(Rows("history").map(row => [row.address, row.hash, row.value]),
        [["walletAddress", "txOne", 1000]])
})
