const {parentPort, isMainThread} = require("worker_threads");
const database = require("better-sqlite3")
const homedir = require('os').homedir()
const {Definitions, Indexes} = require("./schema")

if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async ({action, queryId, query, variables, dbFile}) => {
    switch (action) {
        case "INSERT":
            Insert({queryId, query, variables})
            break
        case "SELECT":
            Select({queryId, query, variables})
            break
        case "SET_DB":
            await SetDb(dbFile)
            break
        default:
            throw new Error(queryId + ": unknown action - " + action)
    }
});

const Insert = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const insert = db.prepare(query)
        const result = await insert.run(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        throw new Error(queryId + ": " + e)
    }
}

const Select = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const select = db.prepare(query)
        const result = await select.all(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        throw new Error(queryId + ": " + e)
    }
}

let _db

const GetDb = async () => {
    return _db
}

const SetDb = async (db) => {
    _db = database(db.replace("~", homedir))
    // Every Insert() lands here as its own statement, so without WAL each one is
    // a separate autocommit against the default rollback journal: create the
    // -journal file, fsync it, fsync the db, delete it. On Windows that measures
    // ~11ms per row, which capped the initial history sync at ~90 rows/second and
    // left wallets with a large history sitting on "Loading transaction history"
    // for hours. WAL plus synchronous=NORMAL commits to an append-only log and
    // only fsyncs on checkpoint, which measures ~0.04ms per row here.
    // synchronous is per-connection so it has to be set on every open; the
    // journal mode is a property of the file and persists.
    _db.pragma("journal_mode = WAL")
    _db.pragma("synchronous = NORMAL")
    const statements = Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)
    _db.transaction(() => {
        for (const statement of statements) {
            _db.prepare(statement).run()
        }
    })()
}
