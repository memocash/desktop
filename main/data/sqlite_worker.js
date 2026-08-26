const {parentPort, isMainThread} = require("worker_threads");
const {DatabaseSync} = require("node:sqlite")
const homedir = require('os').homedir()
const {Definitions, Indexes, Cleanups} = require("./schema")
const {SafeRow} = require("./big_ints")

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

// node:sqlite has no transaction() helper; BEGIN/COMMIT by hand, rolling back
// on failure so the connection isn't left stuck inside an open transaction.
// COMMIT itself can be what fails (a deferred constraint, a full disk), and
// some of those failures auto-rollback while others leave the transaction
// open - so the rollback covers the commit too, tolerates already being out
// of a transaction, and the original error wins over rollback's own.
const Transaction = (db, fn) => {
    db.exec("BEGIN")
    try {
        fn()
        db.exec("COMMIT")
    } catch (e) {
        try {
            db.exec("ROLLBACK")
        } catch {}
        throw e
    }
}

const GetStatement = (db, query) => {
    let statement = cachedStatements.get(query)
    if (statement === undefined) {
        if (cachedStatements.size >= MaxCachedStatements) {
            cachedStatements = new Map()
        }
        statement = db.prepare(query)
        // Reading an integer past 2^53 as a number either throws or rounds.
        // Read everything as BigInt instead and let SafeRow hand back numbers
        // wherever a number is exact - which is everywhere except an oversized
        // token amount.
        statement.setReadBigInts(true)
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
const answer = (queryId, run) => {
    try {
        parentPort.postMessage({queryId, result: run()});
    } catch (e) {
        parentPort.postMessage({queryId, error: String(e)})
    }
}

const Insert = ({queryId, query, variables = []}) =>
    answer(queryId, () => SafeRow(GetStatement(_db, query).run(...variables)))

// Runs a caller's whole set of inserts from one message, inside one
// transaction. Each Insert() otherwise costs a postMessage round trip plus its
// own commit, which is what the save paths spend nearly all their time on: the
// round trips alone measured ~17x the cost of the inserts themselves.
const Batch = ({queryId, statements}) =>
    answer(queryId, () => {
        Transaction(_db, () => {
            for (const {query, variables = []} of statements) {
                GetStatement(_db, query).run(...variables)
            }
        })
        return {statements: statements.length}
    })

const Select = ({queryId, query, variables = []}) =>
    answer(queryId, () => GetStatement(_db, query).all(...variables).map(SafeRow))

let _db

const SetDb = async (db) => {
    // Prepared statements belong to the connection they were compiled against.
    cachedStatements = new Map()
    _db = new DatabaseSync(db.replace("~", homedir))
    // Every Insert() lands here as its own statement, so without WAL each one is
    // a separate autocommit against the default rollback journal: create the
    // -journal file, fsync it, fsync the db, delete it. On Windows that measures
    // ~11ms per row, which capped the initial history sync at ~90 rows/second and
    // left wallets with a large history sitting on "Loading transaction history"
    // for hours. WAL plus synchronous=NORMAL commits to an append-only log and
    // only fsyncs on checkpoint, which measures ~0.04ms per row here.
    // synchronous is per-connection so it has to be set on every open; the
    // journal mode is a property of the file and persists.
    _db.exec("PRAGMA journal_mode = WAL")
    _db.exec("PRAGMA synchronous = NORMAL")
    const statements = Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d)
        .concat(Indexes).concat(Cleanups)
    Transaction(_db, () => {
        for (const statement of statements) {
            _db.prepare(statement).run()
        }
    })
    addSlpValidityColumn()
    healApproximateAmounts()
}

// Databases from before tx-level SLP validity have an slp_checks table without
// the validity column. CREATE TABLE IF NOT EXISTS leaves an existing table
// alone, so the column is added here. Existing rows keep a NULL validity,
// which spendability reads as unverified (fail closed) and the backfill
// re-queries, so every checked transaction gets its verdict on the next
// update without any row being forgotten.
const addSlpValidityColumn = () => {
    const columns = _db.prepare("PRAGMA table_info(slp_checks)").all()
    if (columns.some((column) => column.name === "validity")) {
        return
    }
    _db.exec("ALTER TABLE slp_checks ADD COLUMN validity CHAR")
}

// Token amounts written before the exact-read work may hold a float's
// approximation of the on-chain figure: JSON parsing rounded past 2^53, and
// anything past 2^63 landed in the column as a REAL. Stored amounts are signed
// 64-bit now (see tables/slp.js), so a legitimate row can be negative or
// large - only this one-time sweep, gated on the schema version, may treat
// those shapes as suspect. It forgets the suspect rows and unmarks their
// transactions, and the SLP backfill re-fetches them through the exact parse.
//
// Unmarking alone is not enough to get them back: the unchecked-transactions
// query is bounded to transactions with an unspent wallet output, and a spent
// token's transaction would never re-enter it - its history would simply be
// gone. Every swept transaction therefore also goes into slp_repairs, which
// the backfill drains regardless of whether anything is still unspent.
const healApproximateAmounts = () => {
    if (_db.prepare("PRAGMA user_version").get().user_version >= 1) {
        return
    }
    const suspect = "amount > 9007199254740991 OR amount < 0 OR typeof(amount) = 'real'"
    Transaction(_db, () => {
        _db.prepare("INSERT OR IGNORE INTO slp_repairs (hash) " +
            "SELECT DISTINCT hash FROM slp_outputs WHERE " + suspect).run()
        _db.prepare("DELETE FROM slp_checks WHERE hash IN " +
            "(SELECT hash FROM slp_outputs WHERE " + suspect + ")").run()
        _db.prepare("DELETE FROM slp_outputs WHERE " + suspect).run()
        _db.exec("PRAGMA user_version = 1")
    })
}
