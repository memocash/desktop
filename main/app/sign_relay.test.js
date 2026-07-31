const test = require("node:test")
const assert = require("node:assert")
const {CreateSignRelay} = require("./sign_relay")

const gone = {error: "password-required"}

test("an answer from the window it was sent to settles the wait", async () => {
    const relay = CreateSignRelay()
    let sent
    const asked = relay.Ask({owner: 7, dispatch: (id) => sent = id, unanswered: gone})
    assert.equal(relay.Pending(), 1)
    assert.equal(relay.Answer({owner: 7, id: sent, result: {ok: true}}), true)
    assert.deepEqual(await asked, {ok: true})
    assert.equal(relay.Pending(), 0)
})

test("nothing answers twice, and nothing answers late", async () => {
    const relay = CreateSignRelay()
    let sent
    const asked = relay.Ask({owner: 7, dispatch: (id) => sent = id, unanswered: gone})
    relay.Answer({owner: 7, id: sent, result: {ok: true}})
    assert.equal(relay.Answer({owner: 7, id: sent, result: {ok: "again"}}), false)
    assert.deepEqual(await asked, {ok: true})
})

test("a window cannot answer for a relay it was not asked about", async () => {
    const relay = CreateSignRelay()
    let sent
    const asked = relay.Ask({owner: 7, dispatch: (id) => sent = id, unanswered: gone})
    // Another window offering a signed transaction for someone else's request.
    assert.equal(relay.Answer({owner: 8, id: sent, result: {ok: "forged"}}), false)
    assert.equal(relay.Pending(), 1)
    relay.Abandon(sent, gone)
    assert.deepEqual(await asked, gone)
})

test("a dispatch that throws settles rather than leaving the caller waiting", async () => {
    // Sending to contents destroyed between the check and the send. The caller
    // gets the same answer as having no window to ask.
    const relay = CreateSignRelay()
    let released = false
    const asked = relay.Ask({
        owner: 7,
        dispatch: () => {
            throw new Error("Object has been destroyed")
        },
        release: () => released = true,
        unanswered: gone,
    })
    assert.deepEqual(await asked, gone)
    assert.equal(relay.Pending(), 0)
    assert.equal(released, true)
})

test("abandoning settles the wait and releases what it held", async () => {
    // The window closed, or reloaded and took the listener with it.
    const relay = CreateSignRelay()
    let sent
    let released = false
    const asked = relay.Ask({
        owner: 7,
        dispatch: (id) => sent = id,
        release: () => released = true,
        unanswered: gone,
    })
    assert.equal(relay.Abandon(sent, gone), true)
    assert.deepEqual(await asked, gone)
    assert.equal(released, true)
    assert.equal(relay.Pending(), 0)
    // An answer arriving after the window went is no longer anybody's to give.
    assert.equal(relay.Answer({owner: 7, id: sent, result: {ok: true}}), false)
})

test("each request is waited on separately", async () => {
    const relay = CreateSignRelay()
    const ids = []
    const first = relay.Ask({owner: 7, dispatch: (id) => ids.push(id), unanswered: gone})
    const second = relay.Ask({owner: 8, dispatch: (id) => ids.push(id), unanswered: gone})
    assert.equal(relay.Pending(), 2)
    assert.notEqual(ids[0], ids[1])
    relay.Answer({owner: 8, id: ids[1], result: {ok: "second"}})
    assert.deepEqual(await second, {ok: "second"})
    assert.equal(relay.Pending(), 1)
    relay.Answer({owner: 7, id: ids[0], result: {ok: "first"}})
    assert.deepEqual(await first, {ok: "first"})
    assert.equal(relay.Pending(), 0)
})
