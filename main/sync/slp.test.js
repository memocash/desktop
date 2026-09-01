const test = require("node:test")
const assert = require("node:assert")
const {Close, FakeGraphQL, Open, Rows} = require("./fixture")
const {SaveTransactions} = require("../data/tables")
const {AnsweredTx, SyncSlp} = require("./slp")

const conf = {Server: "https://index.test"}

test("a tx the server returned with outputs is the answer, verdict and all", () => {
    const returned = {hash: "tx1", slp: null, outputs: [{index: 0}]}
    assert.strictEqual(AnsweredTx(returned, "tx1"), returned)
    const slp = {hash: "tx2", slp: {validity: "VALID"}, outputs: [{index: 0}]}
    assert.strictEqual(AnsweredTx(slp, "tx2"), slp)
})

test("a missing tx or an outputless echo stub is unanswered, never NOT_SLP", () => {
    // The index's batch resolver echoes unknown hashes as {hash, slp: null,
    // outputs: []} with no error. Every real transaction has at least one
    // output, so outputless means unknown - and the unanswered shape carries
    // no slp key, storing a NULL verdict that stays frozen and re-asked
    // instead of reading the stub's null slp as a NOT_SLP verdict.
    for (const returned of [undefined, null,
        {hash: "tx1", slp: null, outputs: []},
        {hash: "tx1", slp: null}]) {
        const saved = AnsweredTx(returned, "tx1")
        assert.deepStrictEqual(saved, {hash: "tx1", outputs: []})
        assert.equal("slp" in saved, false)
    }
})

// A UTXO transaction synced by a query that never asked for a verdict, which
// is what the backfill exists to settle.
const unchecked = (hash) => SaveTransactions(conf, [{
    hash, seen: "2026-01-23T20:30:07-08:00", raw: "aabb", inputs: [],
    outputs: [{index: 0, amount: 546, lock: {address: "addrOne"}, script: "cc"}],
}])

test.beforeEach(Open)
test.afterEach(Close)

test("nothing unchecked means nothing asked", async () => {
    const graphQL = FakeGraphQL()
    assert.deepStrictEqual(await SyncSlp({conf, addresses: ["addrOne"], graphQL}), {checked: 0})
    assert.strictEqual(graphQL.calls.length, 0)
})

test("unchecked transactions are asked about, and the index's answer stored", async () => {
    await unchecked("txOne")
    await unchecked("txTwo")
    const graphQL = FakeGraphQL((request) => {
        assert.deepStrictEqual(request.variables, {hash0: "txOne", hash1: "txTwo"})
        return {data: {
            tx0: {hash: "txOne", slp: {validity: "VALID"}, outputs: [{index: 0,
                slp: {amount: 100, token_hash: "tokenOne", genesis: {hash: "tokenOne", token_type: 1,
                    decimals: 0, ticker: "TKN", name: "Token", doc_url: ""}}}]},
            // An echo stub: the index does not know txTwo.
            tx1: {hash: "txTwo", slp: null, outputs: []},
        }}
    })
    const progress = []
    const result = await SyncSlp({conf, addresses: ["addrOne"], graphQL, report: (p) => progress.push(p)})
    assert.deepStrictEqual(result, {checked: 2})
    assert.deepStrictEqual(progress, [{unchecked: 2}])
    assert.deepStrictEqual(Rows("slp_checks", "hash"), [{hash: "txOne", validity: "VALID"}, {hash: "txTwo", validity: null}])
    assert.deepStrictEqual(Rows("slp_outputs"), [{hash: "txOne", index: 0, token_hash: "tokenOne", amount: 100}])
    // The stub stays unsettled: next time it is asked again.
    const again = FakeGraphQL({data: {tx0: {hash: "txTwo", slp: null, outputs: []}}})
    await SyncSlp({conf, addresses: ["addrOne"], graphQL: again})
    assert.deepStrictEqual(again.calls[0].variables, {hash0: "txTwo"})
})

test("an index failure reports the error with the transactions still unchecked", async () => {
    await unchecked("txOne")
    const result = await SyncSlp({conf, addresses: ["addrOne"], graphQL: FakeGraphQL(new Error("down"))})
    assert.deepStrictEqual(result, {checked: 0, error: "down"})
    assert.strictEqual(Rows("slp_checks").length, 0)
})
