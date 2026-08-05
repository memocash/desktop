const test = require("node:test")
const assert = require("node:assert")
const {Worker} = require("worker_threads")

// Now that the worker runs on node:sqlite instead of an Electron-ABI native
// module, the real thing can be spawned under a plain `node --test`. What is
// under test is the transaction lifecycle around a commit that itself fails:
// with a deferred constraint every statement in the batch succeeds and the
// violation only surfaces at COMMIT. That failure must answer the query, roll
// the writes back, and leave the connection outside any transaction - not
// wedge every later batch with "cannot start a transaction within a
// transaction", which is what a rollback that only covered the batch body did.
const StartWorker = () => {
    const worker = new Worker(require.resolve("./sqlite_worker.js"))
    const pending = new Map()
    let nextId = 0
    worker.on("message", (message) => {
        pending.get(message.queryId)(message)
        pending.delete(message.queryId)
    })
    const send = (message) => new Promise((resolve) => {
        const queryId = "q" + nextId++
        pending.set(queryId, resolve)
        worker.postMessage({queryId, ...message})
    })
    return {worker, send}
}

test("a failed commit answers, rolls back, and leaves the connection usable", async () => {
    const {worker, send} = StartWorker()
    try {
        worker.postMessage({action: "SET_DB", dbFile: ":memory:"})
        // node:sqlite enforces foreign keys by default, so the deferred
        // violation passes every statement and fails only at commit time.
        const failed = await send({action: "BATCH", statements: [
            {query: "CREATE TABLE p (id PRIMARY KEY)"},
            {query: "CREATE TABLE c (pid REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED)"},
            {query: "INSERT INTO c VALUES (1)"},
        ]})
        assert.match(failed.error, /FOREIGN KEY/)

        // The whole batch rolled back - even the tables it created are gone.
        const gone = await send({action: "SELECT", query: "SELECT count(*) AS n FROM c"})
        assert.match(gone.error, /no such table/)

        // And the connection is out of the failed transaction: the next batch
        // begins, commits, and its rows are readable.
        const next = await send({action: "BATCH", statements: [
            {query: "CREATE TABLE t (id PRIMARY KEY)"},
            {query: "INSERT INTO t VALUES (1)"},
        ]})
        assert.equal(next.error, undefined)
        const rows = await send({action: "SELECT", query: "SELECT id FROM t"})
        assert.deepEqual(rows.result, [{id: 1}])
    } finally {
        await worker.terminate()
    }
})
