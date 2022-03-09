const {Worker} = require("worker_threads");
const path = require("path")
const worker = new Worker(path.resolve(__dirname, "sqlite_worker.js"));

let queries = {}

worker.on("message", ({queryId, result}) => {
    if (!queries[queryId]) {
        return
    }
    queries[queryId].resolve(result)
})

worker.on("error", (error) => {
    console.log(error)
    for (let queryId in queries) {
        if (error.indexOf(queryId) !== -1) {
            queries[queryId].reject(error)
            return
        }
    }
    console.log("Unknown error: " + error)
})

const Insert = async (query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "INSERT_" + GetQueryId()
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "INSERT", queryId, query, variables})
    })
}

const Select = async (query, variables) => {
    return new Promise((resolve, reject) => {
        const queryId = "SELECT_" + GetQueryId()
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "SELECT", queryId, query, variables})
    })
}

const GetQueryId = () => {
    return Date.now() + "_" + Math.floor(Math.random() * 1e6)
}

module.exports = {
    Insert,
    Select,
}
