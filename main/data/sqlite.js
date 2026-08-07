const {Worker} = require("worker_threads");
const path = require("path")
const {GetId} = require("../common/util");

let queries = {}
let workers = {}

// Every pending promise gets settled, whatever happens. A failed statement
// comes back from the worker as {queryId, error} and rejects the one query it
// belongs to - not, as before, by searching the error's text for a query id,
// which matched only errors phrased a particular way and left every other
// caller waiting forever. A worker that dies outright owes an answer to every
// query in flight on its database: all of them reject, and the dead worker is
// dropped from the map so the next call starts a fresh one instead of posting
// messages to a thread that is gone.
const settle = (queryId, act) => {
    const query = queries[queryId]
    if (!query) {
        return
    }
    delete queries[queryId]
    act(query)
}

const GetWorker = (dbFile) => {
    if (!workers[dbFile]) {
        const worker = new Worker(path.resolve(__dirname, "sqlite_worker.js"));
        worker.on("message", ({queryId, result, error}) => settle(queryId, (query) =>
            error === undefined ? query.resolve(result) : query.reject(new Error(error))))
        const fail = (error) => {
            // Only the current worker has anything left to answer for. A dying
            // worker fires more than one terminal event - an error and then the
            // exit behind it - and by the second one a replacement may already
            // be serving this database. Everything this worker owed was settled
            // when its first failure removed it, and nothing can post to it
            // since, so whatever is pending now is the replacement's: not ours
            // to reject.
            if (workers[dbFile] !== worker) {
                return
            }
            delete workers[dbFile]
            for (const queryId of Object.keys(queries)) {
                if (queries[queryId].dbFile === dbFile) {
                    settle(queryId, (query) => query.reject(error))
                }
            }
        }
        worker.on("error", fail)
        worker.on("exit", (code) => code !== 0 &&
            fail(new Error("db worker exited with code " + code)))
        worker.postMessage({action: "SET_DB", dbFile})
        workers[dbFile] = worker
    }
    return workers[dbFile]
}

// One pending-promise registration per message: the queryId routes the
// worker's answer back, and dbFile scopes the promise to the worker that owes
// it. The action doubles as the queryId prefix.
const post = (conf, action, tableId, message) => {
    return new Promise((resolve, reject) => {
        const queryId = action + "_" + tableId + "_" + GetId()
        queries[queryId] = {resolve, reject, dbFile: conf.DatabaseFile}
        GetWorker(conf.DatabaseFile).postMessage({action, queryId, ...message})
    })
}

const Insert = async (conf, tableId, query, variables) =>
    post(conf, "INSERT", tableId, {query, variables})

// Runs a set of {query, variables} statements in one transaction, from one
// message to the worker. Callers that write several tables from the same batch
// of downloaded data should build all their statements and send them here
// once - see InsertRows for turning rows into those statements.
const InsertBatch = async (conf, tableId, statements) => {
    if (!statements || !statements.length) {
        return
    }
    return post(conf, "BATCH", tableId, {statements})
}

const Select = async (conf, tableId, query, variables) =>
    post(conf, "SELECT", tableId, {query, variables})

// SQLite binds at most 32766 variables to one statement, so a multi-row insert
// can only carry so many rows before it fails with "too many SQL variables".
// A history page can hold tens of thousands of rows for a single table, well
// past that.
const MaxVariables = 32766

// Turns rows (an array of column-value arrays) into the multi-row INSERT
// statements that write them, split so each one stays under the variable limit.
// prefix is everything up to VALUES, e.g. "INSERT OR IGNORE INTO txs (hash)".
const InsertRows = (prefix, rows) => {
    if (!rows.length) {
        return []
    }
    const columns = rows[0].length
    const rowsPerStatement = Math.max(1, Math.floor(MaxVariables / columns))
    const placeholder = "(" + Array(columns).fill("?").join(", ") + ")"
    const statements = []
    for (let i = 0; i < rows.length; i += rowsPerStatement) {
        const chunk = rows.slice(i, i + rowsPerStatement)
        statements.push({
            query: prefix + " VALUES " + Array(chunk.length).fill(placeholder).join(", "),
            variables: chunk.flat(),
        })
    }
    return statements
}

module.exports = {
    Insert,
    InsertBatch,
    InsertRows,
    Select,
}
