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

test("integers round-trip as numbers where exact and BigInts where a number rounds", async () => {
    const {worker, send} = StartWorker()
    try {
        worker.postMessage({action: "SET_DB", dbFile: ":memory:"})
        const inserted = await send({action: "BATCH", statements: [
            {query: "CREATE TABLE t (v INT)"},
            {query: "INSERT INTO t VALUES (?)", variables: [5000]},
            // 2^53 + 1: the first integer a float misses. Bound as a BigInt,
            // which is how oversized token amounts arrive from the tables.
            {query: "INSERT INTO t VALUES (?)", variables: [9007199254740993n]},
        ]})
        assert.equal(inserted.error, undefined)
        const {result} = await send({action: "SELECT", query: "SELECT v FROM t ORDER BY v"})
        assert.deepStrictEqual(result.map(row => row.v), [5000, 9007199254740993n])
        assert.strictEqual(typeof result[0].v, "number")
    } finally {
        await worker.terminate()
    }
})

test("the one-time sweep forgets approximate amounts and spares exact ones, once", async () => {
    const fs = require("fs")
    const os = require("os")
    const path = require("path")
    const {DatabaseSync} = require("node:sqlite")
    const {Definitions} = require("./schema")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slp-heal-"))
    const dbFile = path.join(dir, "wallet.db")
    try {
        // A database from before exact reads: a float's approximation stored
        // as REAL, a rounded mid-range integer, an exact small amount, and all
        // three transactions already marked checked.
        const seed = new DatabaseSync(dbFile)
        for (const definition of Definitions) {
            seed.exec("CREATE TABLE IF NOT EXISTS " + definition)
        }
        const insert = seed.prepare("INSERT INTO slp_outputs (hash, `index`, token_hash, amount) VALUES (?, ?, ?, ?)")
        insert.run("txReal", 1, "tok", 1.8446744073709552e19)
        insert.run("txRounded", 1, "tok", 9007199254740994n)
        insert.run("txExact", 1, "tok", 5000)
        const check = seed.prepare("INSERT INTO slp_checks (hash) VALUES (?)")
        for (const hash of ["txReal", "txRounded", "txExact"]) {
            check.run(hash)
        }
        seed.close()

        const first = StartWorker()
        try {
            first.worker.postMessage({action: "SET_DB", dbFile})
            // The suspect rows and their checked marks are gone, so the SLP
            // backfill will fetch those transactions again; the exact row and
            // its mark survive.
            const outputs = await first.send({action: "SELECT",
                query: "SELECT hash, amount FROM slp_outputs ORDER BY hash"})
            assert.deepStrictEqual(outputs.result, [{hash: "txExact", amount: 5000}])
            const checks = await first.send({action: "SELECT",
                query: "SELECT hash FROM slp_checks ORDER BY hash"})
            assert.deepStrictEqual(checks.result, [{hash: "txExact"}])
            // A legitimate amount from the top half of the uint64 range is
            // stored as its two's-complement negative - the shape the sweep
            // treats as suspect, which is why the sweep may only run once.
            const wrapped = await first.send({action: "BATCH", statements: [{
                query: "INSERT INTO slp_outputs (hash, `index`, token_hash, amount) VALUES (?, ?, ?, ?)",
                variables: ["txMax", 1, "tok", -1n],
            }]})
            assert.equal(wrapped.error, undefined)
        } finally {
            await first.worker.terminate()
        }

        const second = StartWorker()
        try {
            second.worker.postMessage({action: "SET_DB", dbFile})
            // The wrapped value reads back as the number -1 - within the safe
            // range, so normalization hands back a number - and the tables'
            // SlpAmount turns either shape into the on-chain uint64.
            const kept = await second.send({action: "SELECT",
                query: "SELECT hash, amount FROM slp_outputs ORDER BY hash"})
            assert.deepStrictEqual(kept.result,
                [{hash: "txExact", amount: 5000}, {hash: "txMax", amount: -1}])
        } finally {
            await second.worker.terminate()
        }
    } finally {
        fs.rmSync(dir, {recursive: true, force: true})
    }
})
