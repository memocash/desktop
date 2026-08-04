const {parentPort, isMainThread} = require("worker_threads");
const database = require("better-sqlite3")
const homedir = require('os').homedir()
const {Definitions, Indexes, Cleanups} = require("./schema")

if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async ({action, queryId, query, variables, statements, dbFile}) => {
    switch (action) {
        case "INSERT":
            Insert({queryId, query, variables})
            break
        case "BATCH":
            Batch({queryId, statements})
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

// Compiling a statement costs about as much as running it, and the sync paths
// send the same handful of query strings over and over, so keep the compiled
// ones. Chunked inserts make the string depend on the row count, so the set of
// distinct queries isn't bounded on its own - drop the cache wholesale once it
// grows past a session's worth rather than let prepared statements accumulate.
const MaxCachedStatements = 200
let cachedStatements = new Map()

const GetStatement = (db, query) => {
    let statement = cachedStatements.get(query)
    if (statement === undefined) {
        if (cachedStatements.size >= MaxCachedStatements) {
            cachedStatements = new Map()
        }
        statement = db.prepare(query)
        cachedStatements.set(query, statement)
    }
    return statement
}

// A failed statement answers the query that sent it, like any other result.
// Throwing here instead - which is what these catches used to do - kills the
// whole worker: the throw surfaces as an unhandled rejection, the main side
// matched it back to a query by searching the message for the query id, and
// every other pending promise on this worker was left waiting forever on a
// thread that no longer existed.
const Insert = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const result = GetStatement(db, query).run(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        parentPort.postMessage({queryId, error: String(e)})
    }
}

// Runs a caller's whole set of inserts from one message, inside one
// transaction. Each Insert() otherwise costs a postMessage round trip plus its
// own commit, which is what the save paths spend nearly all their time on: the
// round trips alone measured ~17x the cost of the inserts themselves.
const Batch = async ({queryId, statements}) => {
    try {
        const db = await GetDb()
        db.transaction(() => {
            for (const {query, variables} of statements) {
                GetStatement(db, query).run(...(variables === undefined ? [] : variables))
            }
        })()
        parentPort.postMessage({queryId, result: {statements: statements.length}});
    } catch (e) {
        parentPort.postMessage({queryId, error: String(e)})
    }
}

const Select = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const result = GetStatement(db, query).all(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        parentPort.postMessage({queryId, error: String(e)})
    }
}

let _db

const GetDb = async () => {
    return _db
}

const SetDb = async (db) => {
    // Prepared statements belong to the connection they were compiled against.
    cachedStatements = new Map()
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
    const statements = Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d)
        .concat(Indexes).concat(Cleanups)
    _db.transaction(() => {
        for (const statement of statements) {
            _db.prepare(statement).run()
        }
    })()
}
