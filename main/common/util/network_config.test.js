const test = require("node:test")
const assert = require("node:assert")
const {IsLoopbackHost, ValidateNetworkConfig, ValidateNetworkOption} = require("./network_config")

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

test("plaintext stays on this machine: a remote server must use https", () => {
    // The loopback shapes URL can produce: name, IPv4 anywhere in 127/8, and
    // the bracketed IPv6 literal.
    for (const Server of ["http://localhost:8080", "http://127.0.0.1:26772",
        "http://127.1.2.3:26770", "http://[::1]:26772"]) {
        assert.equal(ValidateNetworkOption({...option, Server}).Server, Server)
    }
    for (const Server of ["http://example.com", "http://192.168.1.5:26770",
        "http://memo.cash:80", "http://127.0.0.1.example.com"]) {
        assert.throws(() => ValidateNetworkOption({...option, Server}), /https/, Server)
    }
    assert.equal(ValidateNetworkOption({...option, Server: "https://example.com"}).Server,
        "https://example.com")
})

test("the loopback rule answers the same on its own: the network editor asks it while typing", () => {
    for (const host of ["localhost", "127.0.0.1", "127.255.0.1", "[::1]"]) {
        assert.equal(IsLoopbackHost(host), true, host)
    }
    for (const host of ["example.com", "192.168.1.5", "127.0.0.1.example.com", "::1"]) {
        assert.equal(IsLoopbackHost(host), false, host)
    }
})
