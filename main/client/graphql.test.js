const test = require("node:test")
const assert = require("node:assert")

// The frames a subscription socket receives come from whatever server the user
// configured, so the handler must treat them as untrusted input: a frame that
// doesn't parse, or parses to a shape the protocol doesn't promise, has to end
// that one socket - never escape the handler as an uncaught throw in the main
// process. These tests drive the handler directly through a stub in place of
// ws (the same require-cache technique wallet.test.js uses for electron) and
// pin both the recovery path and the normal protocol exchange around it.
const created = []
class StubWebSocket {
    constructor(url, options) {
        this.url = url
        this.options = options
        this.sent = []
        this.terminateCalls = 0
        this.closeCalls = 0
        created.push(this)
    }

    send(data) {
        this.sent.push(data)
    }

    terminate() {
        this.terminateCalls++
    }

    close() {
        this.closeCalls++
    }
}

const filename = require.resolve("ws")
require.cache[filename] = {id: filename, filename, loaded: true, exports: StubWebSocket}

const {Subscribe, CloseSocket, CloseWindowSockets} = require("./graphql")

// Each subscription gets its own socket and its own delivery log. Every test
// ends by firing onclose: that is the recovery path under test, and it also
// clears the keep-alive watchdog timer the handler arms on every frame.
const subscribe = (id, windowId = 1) => {
    const state = {delivered: [], opened: 0, closed: 0}
    Subscribe({
        network: {Server: "http://server.test"},
        windowId,
        id,
        query: "subscription { blocks { height } }",
        variables: {},
        callback: (data) => state.delivered.push(data),
        onopen: () => state.opened++,
        onclose: () => state.closed++,
    })
    return {socket: created[created.length - 1], state}
}

test("a frame that is not JSON terminates the socket instead of throwing", () => {
    const {socket, state} = subscribe("bad_json")
    assert.doesNotThrow(() => socket.onmessage({data: "not json {"}))
    assert.equal(socket.terminateCalls, 1)
    assert.deepEqual(state.delivered, [])
    socket.onclose()
    assert.equal(state.closed, 1)
})

test("a data frame with no payload terminates the socket and never reaches the callback", () => {
    const {socket, state} = subscribe("no_payload")
    assert.doesNotThrow(() => socket.onmessage({data: JSON.stringify({type: "data"})}))
    assert.equal(socket.terminateCalls, 1)
    assert.deepEqual(state.delivered, [])
    socket.onclose()
    assert.equal(state.closed, 1)
})

test("the normal exchange still flows: init on open, start on ack, payloads to the callback", () => {
    const {socket, state} = subscribe("normal")
    socket.onopen()
    assert.equal(state.opened, 1)
    assert.equal(JSON.parse(socket.sent[0]).type, "connection_init")
    socket.onmessage({data: JSON.stringify({type: "connection_ack"})})
    const start = JSON.parse(socket.sent[1])
    assert.equal(start.type, "start")
    assert.equal(start.payload.query, "subscription { blocks { height } }")
    socket.onmessage({data: JSON.stringify({type: "data", payload: {data: {block: 1}}})})
    socket.onmessage({data: JSON.stringify({type: "ka"})})
    assert.deepEqual(state.delivered, [{block: 1}])
    assert.equal(socket.terminateCalls, 0)
    socket.onclose()
    assert.equal(state.closed, 1)
})

test("a socket says up front how much one frame may carry", () => {
    const {socket} = subscribe("capped")
    assert.equal(socket.options.maxPayload, 8 * 1024 * 1024)
    socket.onclose()
})

test("a subscription is closable by the window that opened it, and only that window", () => {
    const ours = subscribe("shared_id", 1)
    const theirs = subscribe("shared_id", 2)
    // A third window aiming at the shared id hits nothing at all.
    CloseSocket({windowId: 3, id: "shared_id"})
    assert.equal(ours.socket.closeCalls + theirs.socket.closeCalls, 0)
    // The owner's close reaches its own socket and leaves the same id alone
    // under every other window.
    CloseSocket({windowId: 1, id: "shared_id"})
    assert.equal(ours.socket.closeCalls, 1)
    assert.equal(theirs.socket.closeCalls, 0)
    ours.socket.onclose()
    theirs.socket.onclose()
})

test("a window's sockets all close when the window does, nobody else's do", () => {
    const first = subscribe("one", 7)
    const second = subscribe("two", 7)
    const other = subscribe("one", 8)
    CloseWindowSockets(7)
    assert.equal(first.socket.closeCalls, 1)
    assert.equal(second.socket.closeCalls, 1)
    assert.equal(other.socket.closeCalls, 0)
    first.socket.onclose()
    second.socket.onclose()
    CloseSocket({windowId: 8, id: "one"})
    other.socket.onclose()
})

test("reusing an id ends the socket that held it, and a late close cannot evict the replacement", () => {
    const first = subscribe("dup", 9)
    const second = subscribe("dup", 9)
    assert.equal(first.socket.closeCalls, 1)
    assert.equal(second.socket.closeCalls, 0)
    // The evicted socket's close event arrives after the replacement took the
    // key; the key must still name the replacement.
    first.socket.onclose()
    CloseSocket({windowId: 9, id: "dup"})
    assert.equal(second.socket.closeCalls, 1)
    second.socket.onclose()
})
