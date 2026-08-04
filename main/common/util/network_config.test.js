const test = require("node:test")
const assert = require("node:assert")
const {ValidateNetworkConfig, ValidateNetworkOption} = require("./network_config")

const option = {
    Name: "BCH", Ruleset: "bch", DatabaseFile: "~/.memo/memo.db",
    Server: "https://graph.cash", Id: "bch",
}

test("normalizes a valid network option", () => {
    assert.deepEqual(ValidateNetworkOption(option), option)
})

test("rejects renderer-controlled paths and option fields", () => {
    assert.throws(() => ValidateNetworkOption({...option, DatabaseFile: "/tmp/other.db"}))
    assert.throws(() => ValidateNetworkOption({...option, DatabaseFile: "~/.memo/nested/other.db"}))
    assert.throws(() => ValidateNetworkOption({...option, Extra: true}))
})

test("rejects unsafe server shapes", () => {
    for (const Server of ["file:///tmp/x", "https://user:pass@example.com", "https://example.com/graphql",
        "https://example.com?q=x", "https://example.com/#x"]) {
        assert.throws(() => ValidateNetworkOption({...option, Server}), Server)
    }
})

test("validates config shape, unique ids, and the last index", () => {
    assert.deepEqual(ValidateNetworkConfig({Networks: [option], Last: 0}), {Networks: [option], Last: 0})
    assert.throws(() => ValidateNetworkConfig({Networks: [option], Unknown: true}))
    assert.throws(() => ValidateNetworkConfig({Networks: [option, option]}))
    assert.throws(() => ValidateNetworkConfig({Networks: [option], Last: 1}))
})
