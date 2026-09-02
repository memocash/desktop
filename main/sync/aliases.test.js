const test = require("node:test")
const assert = require("node:assert")
const {Close, FakeGraphQL, Open, Rows} = require("./fixture")
const baddress = require("../common/bitcoin/address")
const bscript = require("../common/bitcoin/script")
const opcodes = require("../common/bitcoin/opcodes.json")
const {Prefix} = require("../common/memo")
const {SyncAliases} = require("./aliases")

const conf = {Server: "https://index.test"}

const targetHash = Buffer.alloc(20, 7)
const target = baddress.toBase58Check(targetHash, 0)
const signer = baddress.toBase58Check(Buffer.alloc(20, 9), 0)

const aliasTx = (hash, from, alias) => ({
    hash, seen: "2026-01-23T20:30:07-08:00",
    inputs: [{index: 0, prev_hash: "prev", prev_index: 0, output: {lock: {address: from}}}],
    outputs: [{index: 0, amount: 0, lock: null, script: bscript.compile(
        [opcodes.OP_RETURN, Buffer.from(Prefix.SetAlias, "hex"), targetHash, Buffer.from(alias)]).toString("hex")}],
    blocks: [],
})

test.beforeEach(Open)
test.afterEach(Close)

test("alias transactions signed by the identity are read out of their scripts and stored", async () => {
    const graphQL = FakeGraphQL({data: {
        address0: {txs: [aliasTx("txAlias", signer, "bob")]},
        // The same transaction comes back under the address it names too.
        address1: {txs: [aliasTx("txAlias", signer, "bob"), aliasTx("txStranger", "someoneElse", "mallory")]},
    }})
    const aliases = await SyncAliases({conf, addresses: [signer, target], graphQL})
    assert.deepStrictEqual(graphQL.calls[0].variables, {address0: signer, address1: target})
    assert.deepStrictEqual(aliases, [{tx_hash: "txAlias", address: signer, target_address: target, alias: "bob"}])
    // Only the identity's own alias is stored; a stranger naming the same
    // address is not part of this identity.
    assert.deepStrictEqual(Rows("address_aliases").map(row => row.tx_hash), ["txAlias"])
    // The transactions themselves are stored once each, so the alias has a
    // time to sort by.
    assert.deepStrictEqual(Rows("txs", "hash").map(row => row.hash), ["txAlias", "txStranger"])
})

test("no addresses means nothing asked", async () => {
    const graphQL = FakeGraphQL()
    assert.deepStrictEqual(await SyncAliases({conf, addresses: [], graphQL}), [])
    assert.strictEqual(graphQL.calls.length, 0)
})
