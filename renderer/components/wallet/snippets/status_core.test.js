const test = require("node:test")
const assert = require("node:assert")
const {CountUtxos} = require("./status_core")

const wallet = ["addrOne", "addrTwo"]

const coin = (overrides = {}) =>
    ({hash: "tx", index: 0, value: 10000, address: "addrOne", slp_validity: "NOT_SLP", ...overrides})

test("token and baton rows count only when the index calls them VALID", () => {
    // The same rule the token balance queries and the signer apply: an
    // INVALID annotation carries nothing on chain, and an undecided one may
    // still settle either way - neither is inventory.
    for (const rows of [{slp_token_hash: "t"}, {slp_baton_token_hash: "t"}]) {
        assert.equal(CountUtxos([coin({...rows, slp_validity: "VALID"})], wallet).tokenUtxos, 1)
        for (const slp_validity of ["INVALID", "PENDING", "NOT_SLP", null, undefined]) {
            const counts = CountUtxos([coin({...rows, slp_validity})], wallet)
            // Not a token the wallet holds, and never a spendable coin either.
            assert.equal(counts.tokenUtxos, 0)
            assert.equal(counts.spendableUtxos, 0)
        }
    }
})

test("spendable counts follow the builders' decided-verdict rule", () => {
    for (const slp_validity of ["NOT_SLP", "VALID", "INVALID"]) {
        assert.equal(CountUtxos([coin({slp_validity})], wallet).spendableUtxos, 1)
    }
    for (const slp_validity of ["PENDING", null, undefined]) {
        assert.equal(CountUtxos([coin({slp_validity})], wallet).spendableUtxos, 0)
    }
    // Linked addresses' coins aren't the wallet's to spend.
    assert.equal(CountUtxos([coin({address: "elsewhere"})], wallet).spendableUtxos, 0)
})

test("a mixed coin list splits into the two counts the status bar shows", () => {
    const counts = CountUtxos([
        coin(),
        coin({slp_token_hash: "t", slp_validity: "VALID"}),
        coin({slp_token_hash: "t", slp_validity: "INVALID"}),
        coin({slp_validity: "PENDING"}),
    ], wallet)
    assert.deepEqual(counts, {spendableUtxos: 1, tokenUtxos: 1})
})
