const test = require("node:test")
const assert = require("node:assert")
const {AnsweredTx} = require("./slp_core")

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
