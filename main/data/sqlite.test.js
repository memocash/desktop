const test = require("node:test")
const assert = require("node:assert")
const {EventEmitter} = require("node:events")

// What is under test is the promise bookkeeping between this process and the
// worker thread: that a failed statement answers exactly the query that sent
// it, and that a worker dying answers everything in flight on its database
// rather than leaving promises pending forever - which is what the old
// routing did, by searching the error's text for a query id. The worker
// itself is stubbed (the table tests already run the SQL against
// node:sqlite); the stub speaks the worker's message shapes.
const spawned = []
class StubWorker extends EventEmitter {
    constructor(file) {
        super()
        this.file = file
        this.posted = []
        spawned.push(this)
    }

    postMessage(message) {
        this.posted.push(message)
    }
}

const filename = require.resolve("worker_threads")
require.cache[filename] = {id: filename, filename, loaded: true, exports: {Worker: StubWorker}}
const {Insert, InsertBatch, Select} = require("./sqlite")

const settled = (promise) => {
    const state = {done: false}
    promise.then(
        (value) => Object.assign(state, {done: true, value}),
        (error) => Object.assign(state, {done: true, error}))
    return state
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test("each answer reaches the query that asked, errors included", async () => {
    const conf = {DatabaseFile: "one.db"}
    const first = settled(Insert(conf, "a", "INSERT ..."))
    const second = settled(Select(conf, "b", "SELECT ..."))
    const worker = spawned[spawned.length - 1]
    assert.equal(worker.posted[0].action, "SET_DB")
    const [insert, select] = worker.posted.slice(1)

    worker.emit("message", {queryId: "unknown_query", result: 1})
    worker.emit("message", {queryId: insert.queryId, error: "no such table: things"})
    worker.emit("message", {queryId: select.queryId, result: [{name: "one"}]})
    await flush()
    assert.match(first.error.message, /no such table/)
    assert.deepEqual(second.value, [{name: "one"}])

    // Settled means settled: a duplicate answer has nobody left to confuse.
    worker.emit("message", {queryId: insert.queryId, result: "late"})
    await flush()
    assert.match(first.error.message, /no such table/)
})

test("a dead worker answers everything it owed, and its replacement starts fresh", async () => {
    const conf = {DatabaseFile: "dying.db"}
    const otherConf = {DatabaseFile: "healthy.db"}
    const owed = settled(Insert(conf, "a", "INSERT ..."))
    const alsoOwed = settled(InsertBatch(conf, "b", [{query: "INSERT ..."}]))
    const unrelated = settled(Select(otherConf, "c", "SELECT ..."))
    const dying = spawned.find((worker) => worker.posted[0].dbFile === "dying.db")
    const healthy = spawned.find((worker) => worker.posted[0].dbFile === "healthy.db")

    dying.emit("error", new Error("worker blew up"))
    await flush()
    // Both of the dead worker's promises answered; the other database's
    // query neither rejected nor resolved on its account.
    assert.match(owed.error.message, /blew up/)
    assert.match(alsoOwed.error.message, /blew up/)
    assert.equal(unrelated.done, false)
    healthy.emit("message", {queryId: healthy.posted[1].queryId, result: []})
    await flush()
    assert.deepEqual(unrelated.value, [])

    // The next query on the failed database gets a new worker, not messages
    // posted at a dead thread.
    const before = spawned.length
    const retried = settled(Select(conf, "d", "SELECT ..."))
    assert.equal(spawned.length, before + 1)
    const replacement = spawned[spawned.length - 1]
    replacement.emit("message", {queryId: replacement.posted[1].queryId, result: ["fresh"]})
    await flush()
    assert.deepEqual(retried.value, ["fresh"])
})

test("an unexpected exit is a death like any other", async () => {
    const conf = {DatabaseFile: "exiting.db"}
    const owed = settled(Insert(conf, "a", "INSERT ..."))
    const worker = spawned[spawned.length - 1]
    worker.emit("exit", 1)
    await flush()
    assert.match(owed.error.message, /exited with code 1/)
})

// A dying worker fires more than one terminal event: an error, then the exit
// behind it. The first one already settled everything the worker owed and
// installed nothing in its place - so by the time the exit arrives, whatever
// is pending on this database belongs to the replacement, and the late event
// must not reach it.
test("an old worker's exit does not reject its replacement's queries", async () => {
    const conf = {DatabaseFile: "recovering.db"}
    const doomed = settled(Select(conf, "a", "SELECT ..."))
    const oldWorker = spawned[spawned.length - 1]
    oldWorker.emit("error", new Error("first failure"))
    await flush()
    assert.match(doomed.error.message, /first failure/)

    const retried = settled(Select(conf, "b", "SELECT ..."))
    const replacement = spawned[spawned.length - 1]
    assert.notEqual(replacement, oldWorker)
    // The straggling exit from the worker that already failed.
    oldWorker.emit("exit", 1)
    await flush()
    assert.equal(retried.done, false, "the replacement's query must still be pending")
    replacement.emit("message", {queryId: replacement.posted[1].queryId, result: [2]})
    await flush()
    assert.deepEqual(retried.value, [2])
})
