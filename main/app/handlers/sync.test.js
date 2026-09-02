const test = require("node:test")
const assert = require("node:assert")
const EventEmitter = require("events")

// A subscription is opened by a page and answered to that page. What is under
// test is what becomes of it when the page goes: a reload or a navigation
// replaces the document while the window - and the WebContents the handler
// used to check - lives on. The old page's subscriptions have to end in main,
// nothing may be sent to the frame the old page was (Electron reports every
// such attempt as an error), and the new page's own subscriptions have to
// work. Electron is stubbed the way the other handler tests stub it, ws the
// way graphql.test.js does, and the sync kinds by one that records its saves.
const handlers = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: (channel, fn) => handlers[channel] = fn,
        on: (channel, fn) => handlers[channel] = fn,
    },
    BrowserWindow: class {},
    nativeTheme: {},
    screen: {},
    shell: {},
})
stub("../../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})

const created = []
class StubWebSocket {
    constructor() {
        this.closeCalls = 0
        created.push(this)
    }

    send() {
    }

    terminate() {
    }

    close() {
        this.closeCalls++
    }
}

stub("ws", StubWebSocket)

const saved = []
let betweenReports = () => {}
stub("../../sync", {
    Subscriptions: {
        test: {
            query: "subscription { test }",
            save: async ({data, forward}) => {
                saved.push(data)
                forward()
            },
        },
    },
    SyncHistory: async ({report}) => {
        report({saved: 1})
        betweenReports()
        report({saved: 2})
        return {saved: 2}
    },
})

const {Handlers, Listeners} = require("../../common/util")
const {SetNetworkOption} = require("../window_state")
const {CloseSocketsWithPage} = require("../window")
require("./sync").SyncHandlers()

// What matters about Electron's WebFrameMain here: there is one object per
// frame, re-pointed at each new document the frame shows - its token changes,
// its identity does not - or marked disposed, after which reading its token
// or sending to it throws the error the bug report is full of.
const Disposed = "Render frame was disposed before WebFrameMain could be accessed"
class StubFrame {
    constructor(token) {
        this.url = "app://-/"
        this.token = token
        this.disposed = false
        this.heard = []
    }

    get frameToken() {
        if (this.disposed) {
            throw new Error(Disposed)
        }
        return this.token
    }

    isDestroyed() {
        return this.disposed
    }

    send(channel, data) {
        if (this.disposed) {
            throw new Error(Disposed)
        }
        this.heard.push([channel, data])
    }
}

let windows = 0
const page = () => {
    const frame = new StubFrame("doc-1")
    // A WebContents outlives its documents, and its send is a send to
    // whatever its frame shows by then - the check the handler used to make.
    const contents = Object.assign(new EventEmitter(), {
        id: ++windows,
        mainFrame: frame,
        isDestroyed: () => false,
        send: (channel, data) => frame.send(channel, data),
    })
    SetNetworkOption(contents.id, {Server: "http://server.test"})
    CloseSocketsWithPage({webContents: contents})
    return {frame, contents, event: {sender: contents, senderFrame: frame}}
}
const listen = ({event}, id) => {
    handlers[Handlers.SyncListen](event, {id, kind: "test", variables: {}, addresses: []})
    return created[created.length - 1]
}
// A frame from the index: stored first, forwarded after, so the forward
// lands only once the save has run its course.
const push = async (socket, payload) => {
    socket.onmessage({data: JSON.stringify({type: "data", payload: {data: payload}})})
    await new Promise((resolve) => setImmediate(resolve))
}

test("a subscription's frames reach the page that asked, once main has stored them", async () => {
    const one = page()
    const socket = listen(one, "a")
    socket.onopen()
    await push(socket, {test: 1})
    assert.deepStrictEqual(saved, [{test: 1}])
    assert.deepStrictEqual(one.frame.heard, [
        [Listeners.SyncOpenPrefix + "a", undefined],
        [Listeners.SyncDataPrefix + "a", {test: 1}],
    ])
    handlers[Handlers.SyncListenClose](one.event, {id: "a"})
    assert.strictEqual(socket.closeCalls, 1)
    socket.onclose()
})

test("a reload ends the old page's subscriptions, answers nothing to where it was, and leaves the new page its own", async () => {
    const one = page()
    const first = listen(one, "a")
    const second = listen(one, "b")
    first.onopen()
    second.onopen()
    // The reload: the frame now shows a new document, the WebContents is the
    // same and alive, and nobody sent SyncListenClose for a or b.
    one.frame.token = "doc-2"
    one.frame.heard.length = 0
    one.contents.emit("did-navigate", {}, "app://-/", 200, "OK")
    assert.strictEqual(first.closeCalls, 1)
    assert.strictEqual(second.closeCalls, 1)
    // The closes, and a frame the index pushed before the close reached it,
    // arrive after the page they were for is gone: stored, never forwarded,
    // never an error.
    saved.length = 0
    assert.doesNotThrow(() => first.onclose())
    await push(second, {test: 2})
    assert.doesNotThrow(() => second.onclose())
    assert.deepStrictEqual(saved, [{test: 2}])
    assert.deepStrictEqual(one.frame.heard, [])
    // The new document's subscription is answered as any page's is.
    const third = listen(one, "c")
    third.onopen()
    await push(third, {test: 3})
    assert.strictEqual(third.closeCalls, 0)
    assert.deepStrictEqual(one.frame.heard, [
        [Listeners.SyncOpenPrefix + "c", undefined],
        [Listeners.SyncDataPrefix + "c", {test: 3}],
    ])
    handlers[Handlers.SyncListenClose](one.event, {id: "c"})
    third.onclose()
})

test("a frame Electron has disposed is never sent to", async () => {
    const one = page()
    const socket = listen(one, "a")
    one.frame.disposed = true
    assert.doesNotThrow(() => socket.onopen())
    await assert.doesNotReject(push(socket, {test: 4}))
    assert.doesNotThrow(() => socket.onclose())
    assert.deepStrictEqual(one.frame.heard, [])
})

test("one page's navigation closes nothing another window holds", () => {
    const one = page()
    const other = page()
    const ours = listen(one, "a")
    const theirs = listen(other, "a")
    one.contents.emit("did-navigate", {}, "app://-/", 200, "OK")
    assert.strictEqual(ours.closeCalls, 1)
    assert.strictEqual(theirs.closeCalls, 0)
    ours.onclose()
    handlers[Handlers.SyncListenClose](other.event, {id: "a"})
    theirs.onclose()
})

test("a page replaced by an error page, or whose renderer died, loses its subscriptions the same way", () => {
    const failed = page()
    const socket = listen(failed, "a")
    // A frame's failed load is not the page going; the main frame's is.
    failed.contents.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "app://-/", false, 1, 1)
    assert.strictEqual(socket.closeCalls, 0)
    failed.contents.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "app://-/", true, 1, 1)
    assert.strictEqual(socket.closeCalls, 1)
    socket.onclose()
    const crashed = page()
    const bystander = page()
    const ours = listen(crashed, "a")
    const theirs = listen(bystander, "a")
    crashed.contents.emit("render-process-gone", {}, {reason: "crashed", exitCode: 1})
    assert.strictEqual(ours.closeCalls, 1)
    assert.strictEqual(theirs.closeCalls, 0)
    ours.onclose()
    handlers[Handlers.SyncListenClose](bystander.event, {id: "a"})
    theirs.onclose()
})

test("a sync's progress reaches the page that asked, and stops at its reload", async () => {
    const one = page()
    betweenReports = () => one.frame.token = "doc-2"
    const result = await handlers[Handlers.SyncHistory](one.event, {id: "p", addresses: []})
    assert.deepStrictEqual(result, {saved: 2})
    assert.deepStrictEqual(one.frame.heard, [[Listeners.SyncProgressPrefix + "p", {saved: 1}]])
})
