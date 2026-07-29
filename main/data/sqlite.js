const {Worker} = require("worker_threads");
const path = require("path")
const {GetId} = require("../common/util");

let queries = {}
let workers = {}

const GetWorker = (dbFile) => {
    if (!workers[dbFile]) {
        workers[dbFile] = new Worker(path.resolve(__dirname, "sqlite_worker.js"));
        workers[dbFile].on("message", ({queryId, result}) => {
            if (!queries[queryId]) {
                return
            }
            queries[queryId].resolve(result)
        })
        workers[dbFile].on("error", (error) => {
            for (let queryId in queries) {
                if (error.toString().indexOf(queryId) !== -1) {
                    queries[queryId].reject(error)
                    return
                }
            }
            console.log("Unknown error: " + error)
        })
        workers[dbFile].postMessage({action: "SET_DB", dbFile})
    }
    return workers[dbFile]
}

const Insert = async (conf, tableId, query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "INSERT_" + tableId + "_" + GetId()
        queries[queryId] = {resolve, reject}
        GetWorker(conf.DatabaseFile).postMessage({action: "INSERT", queryId, query, variables})
    })
}

// Runs a set of {query, variables} statements in one transaction, from one
// message to the worker. Callers that write several tables from the same batch
// of downloaded data should build all their statements and send them here
// once - see InsertRows for turning rows into those statements.
const InsertBatch = async (conf, tableId, statements) => {
    if (!statements || !statements.length) {
        return
    }
    return new Promise((resolve, reject) => {
        const queryId = "BATCH_" + tableId + "_" + GetId()
        queries[queryId] = {resolve, reject}
        GetWorker(conf.DatabaseFile).postMessage({action: "BATCH", queryId, statements})
    })
}

const Select = async (conf, tableId, query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "SELECT_" + tableId + "_" + GetId()
        queries[queryId] = {resolve, reject}
        GetWorker(conf.DatabaseFile).postMessage({action: "SELECT", queryId, query, variables})
    })
}

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
