const test = require("node:test")
const assert = require("node:assert")

// The sync preload runs against a scripted ipcRenderer. What is under test is
// the contract with main: progress reaches the caller only while its own
// request is in flight, a subscription's listeners go when it is closed, and
// the page has no way left to write to the database.
const invoked = []
const sent = []
const listeners = new Map()
const respond = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    ipcRenderer: {
        invoke: async (channel, ...args) => {
            invoked.push([channel, ...args])
            return respond[channel](...args)
        },
        on: (channel, listener) => listeners.set(channel, listener),
        removeListener: (channel, listener) => listeners.get(channel) === listener && listeners.delete(channel),
        send: (channel, ...args) => sent.push([channel, ...args]),
    },
})

const {Handlers, Listeners} = require("../common/util/handlers")
const preload = require("./sync")

test("progress is heard on the request's own channel until the sync settles", async () => {
    const heard = []
    respond[Handlers.SyncHistory] = async ({id, addresses}) => {
        assert.deepStrictEqual(addresses, ["a"])
        const listener = listeners.get(Listeners.SyncProgressPrefix + id)
        listener({}, {saved: 10})
        listener({}, {updated: true})
        return {saved: 10, connected: true}
    }
    const result = await preload.syncHistory({addresses: ["a"], onProgress: (p) => heard.push(p)})
    assert.deepStrictEqual(result, {saved: 10, connected: true})
    assert.deepStrictEqual(heard, [{saved: 10}, {updated: true}])
    assert.strictEqual(listeners.size, 0)
})

test("a failed sync still drops its progress listener", async () => {
    respond[Handlers.SyncSlp] = async () => {
        throw new Error("refused")
    }
    await assert.rejects(preload.syncSlp({addresses: ["a"]}), {message: "refused"})
    assert.strictEqual(listeners.size, 0)
})

test("a subscription is asked for by kind and its listeners go with its close", () => {
    const frames = []
    const close = preload.listenSync({kind: "txs", variables: {addresses: ["a"]}, handler: (data) => frames.push(data)})
    const [channel, request] = sent[sent.length - 1]
    assert.strictEqual(channel, Handlers.SyncListen)
    assert.strictEqual(request.kind, "txs")
    assert.deepStrictEqual(request.variables, {addresses: ["a"]})
    listeners.get(Listeners.SyncDataPrefix + request.id)({}, {addresses: {hash: "tx1"}})
    assert.deepStrictEqual(frames, [{addresses: {hash: "tx1"}}])
    assert.strictEqual(listeners.size, 3)
    close()
    assert.deepStrictEqual(sent[sent.length - 1], [Handlers.SyncListenClose, {id: request.id}])
    assert.strictEqual(listeners.size, 0)
})

test("the page can read the database and ask for syncs, never write", () => {
    const exposed = {...require("./data"), ...require("./graphql"), ...require("./profile"), ...preload}
    for (const name of Object.keys(exposed)) {
        assert.ok(!/^save|^generate/.test(name), name + " is a write the page should not have")
    }
    for (const name of Object.keys(Handlers)) {
        assert.ok(!/^Save(?!NetworkConfig)|^GenerateHistory|^GraphQLSubscribe$/.test(name),
            name + " is a channel main should not answer")
    }
})
