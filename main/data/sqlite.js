const {Worker} = require("worker_threads");
const path = require("path")
const {GetId} = require("../common/util");
const worker = new Worker(path.resolve(__dirname, "sqlite_worker.js"));

let queries = {}

worker.on("message", ({queryId, result}) => {
    if (!queries[queryId]) {
        return
    }
    queries[queryId].resolve(result)
})

worker.on("error", (error) => {
    for (let queryId in queries) {
        if (error.toString().indexOf(queryId) !== -1) {
            queries[queryId].reject(error)
            return
        }
    }
    console.log("Unknown error: " + error)
})

const Insert = async (query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "INSERT_" + GetId()
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "INSERT", queryId, query, variables})
    })
}

const Select = async (query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "SELECT_" + GetId()
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "SELECT", queryId, query, variables})
    })
}

module.exports = {
    Insert,
    Select,
}
