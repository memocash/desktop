const test = require("node:test")
const assert = require("node:assert")
const {ParseQuery, RouteTarget} = require("./router_core")

// What the shim owes the pages that swapped next/router for it: tx/info.js
// destructures its parameters from query, and index.js pushes "/wallet" and
// must land on the directory path the export actually holds.
test("query parsing and navigation targets match what the pages expect", () => {
    assert.deepEqual(ParseQuery("?txHash=abc123&beatHash=def"),
        {txHash: "abc123", beatHash: "def"})
    assert.deepEqual(ParseQuery(""), {})
    assert.equal(ParseQuery("?a=%2Fslash").a, "/slash")
    assert.equal(RouteTarget("/wallet"), "/wallet/")
    assert.equal(RouteTarget("/wallet/"), "/wallet/")
})
