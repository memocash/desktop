const {Worker} = require("worker_threads");

const worker = new Worker("./sqlite_worker.js");

let queries = {}

worker.on("message", ({queryId, result}) => {
    console.log("Received worker message: " + queryId + ", result: " + result)
    if (!queries[queryId]) {
        return
    }
    queries[queryId].resolve(result)
})

worker.on("error", (error) => {
    for (let queryId in queries) {
        if (error.indexOf(querId) !== -1) {
            queries[queryId].reject(error)
        }
    }
    console.log("Unknown error: " + error)
})

const Insert = async (query, variables) => {
    return new Promise(({resolve, reject}) => {
        const queryId = Date.now() + Math.floor(Math.random() * 1e6)
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "INSERT", queryId, query, variables})
        console.log("FINISHED Posting Insert worker message")
    })
}

const Select = async (query, variables) => {
    return new Promise(({resolve, reject}) => {
        const queryId = Date.now() + Math.floor(Math.random() * 1e6)
        queries[queryId] = {resolve, reject}
        worker.postMessage({action: "SELECT", queryId, query, variables})
        console.log("FINISHED Posting Select worker message")
    })
}

module.exports = {
    Insert,
    Select,
}
