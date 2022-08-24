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

const Select = async (conf, tableId, query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "SELECT_" + tableId + "_" + GetId()
        queries[queryId] = {resolve, reject}
        GetWorker(conf.DatabaseFile).postMessage({action: "SELECT", queryId, query, variables})
    })
}

module.exports = {
    Insert,
    Select,
}
