const test = require("node:test")
const assert = require("node:assert")
const {NextSelection, SelectedNetwork, ServerError, SubmitNetworkForm} = require("./selector_core")

const config = () => ({
    Networks: [
        {Name: "BCH", Ruleset: "bch", DatabaseFile: "~/.memo/memo.db",
            Server: "https://graph.cash", Id: "bch"},
        {Name: "BSV", Ruleset: "bsv", DatabaseFile: "~/.memo/memo-sv.db",
            Server: "http://127.0.0.1:26772", Id: "bsv"},
    ],
    Last: 0,
})

// The load screen refuses to open a wallet on a selection that names no
// configured network - the fallthrough this replaced opened the window with
// no network at all, and the wallet page's data calls failed one by one
// against a network nobody chose.
test("an unmatched network selection is refused, a matched one is found with its index", () => {
    assert.throws(() => SelectedNetwork(config(), undefined), /no configured network/)
    assert.throws(() => SelectedNetwork(config(), "gone"), /no configured network/)
    const {index, option} = SelectedNetwork(config(), "bsv")
    assert.equal(index, 1)
    assert.equal(option.Server, "http://127.0.0.1:26772")
})

// The editor's list switches the form on selection change; a dirty form asks
// first, and a declined ask reverts the highlight instead of switching. A
// clean form must not ask - the editor opens onto this handler's path.
test("selection change switches, asks when dirty, and reverts when declined", () => {
    const options = config().Networks
    let asked = 0
    const clean = NextSelection({options, currentId: "bch", nextId: "bsv",
        hasChanged: false, confirmDiscard: () => { asked++; return false }})
    assert.equal(clean.network.Id, "bsv")
    assert.equal(asked, 0)
    const declined = NextSelection({options, currentId: "bch", nextId: "bsv",
        hasChanged: true, confirmDiscard: () => { asked++; return false }})
    assert.deepEqual(declined, {revertTo: "bch"})
    assert.equal(asked, 1)
    const confirmed = NextSelection({options, currentId: "bch", nextId: "bsv",
        hasChanged: true, confirmDiscard: () => true})
    assert.equal(confirmed.network.Id, "bsv")
})

// A save the validator refuses rejects before the result exists, so the
// caller's state updates - which need the return value - cannot run: the
// form goes on showing the unsaved values and the error, never a saved look
// over an unsaved file.
test("a refused save rejects with its reason and yields no result to apply", async () => {
    let saved = 0
    await assert.rejects(SubmitNetworkForm({
        getConfig: async () => config(),
        save: async () => { throw new Error("A network server outside this machine must use https") },
        networkId: "bsv",
        values: {Name: "BSV", Ruleset: "bsv", DatabaseFile: "~/.memo/memo-sv.db",
            Server: "http://example.com"},
    }).then(() => saved++), /https/)
    assert.equal(saved, 0)
})

// An accepted save carries the form's values onto the edited network alone,
// keeps Last, and hands back the updated network for the form to go on
// editing. The trailing slash is stripped the way the saved file expects.
test("an accepted save updates only the edited network and returns it", async () => {
    const written = []
    const {networkConfig, updatedNetwork} = await SubmitNetworkForm({
        getConfig: async () => config(),
        save: async (value) => written.push(value),
        networkId: "bsv",
        values: {Name: "BSV", Ruleset: "bsv", DatabaseFile: "~/.memo/memo-sv.db",
            Server: "http://localhost:26772/"},
    })
    assert.equal(written.length, 1)
    assert.equal(written[0], networkConfig)
    assert.equal(updatedNetwork.Server, "http://localhost:26772")
    assert.equal(networkConfig.Networks[1], updatedNetwork)
    assert.deepEqual(networkConfig.Networks[0], config().Networks[0])
    assert.equal(networkConfig.Last, 0)
})

// The live check mirrors every rule main's ValidateNetworkOption enforces,
// so a server the editor accepts is one the save will not refuse. The https
// rule is the one that used to be missing: main rejected what the editor
// passed, and the rejection vanished.
test("the live server check answers with each rule's own message", () => {
    assert.match(ServerError("graph.cash"), /http/)
    assert.match(ServerError("http://"), /parse/)
    assert.match(ServerError("https://example.com/graphql"), /path/)
    assert.match(ServerError("https://example.com?q=x"), /search/)
    assert.match(ServerError("https://example.com/#x"), /fragment/)
    assert.match(ServerError("https://user:pass@example.com"), /credentials/)
    assert.match(ServerError("http://example.com"), /https/)
    assert.equal(ServerError("http://127.0.0.1:26772"), "")
    assert.equal(ServerError("http://localhost:8080"), "")
    assert.equal(ServerError("https://graph.cash"), "")
})
