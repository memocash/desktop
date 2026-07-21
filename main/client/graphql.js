const http = require("http");
const https = require("https");
const WebSocket = require('ws');

const sockets = {}

const CloseSocket = ({id}) => {
    if (!sockets[id]) {
        return
    }
    sockets[id].close()
    delete sockets[id]
}

// If no traffic (not even server "ka" keepalives) arrives within this window we
// treat the socket as a dead zombie - a silent network drop that never
// delivered a clean close - and force it shut so onclose fires and the renderer
// reconnects.
const KeepAliveTimeoutMs = 60000

const Subscribe = ({network, id, query, variables, callback, onopen, onclose}) => {
    let socket = new WebSocket(httpUrlToWs(network.Server) + "/graphql")
    let watchdog = null
    const clearWatchdog = () => {
        if (watchdog) {
            clearTimeout(watchdog)
            watchdog = null
        }
    }
    const resetWatchdog = () => {
        clearWatchdog()
        watchdog = setTimeout(() => socket.terminate(), KeepAliveTimeoutMs)
    }
    socket.onmessage = (ev) => {
        resetWatchdog()
        const data = JSON.parse(ev.data)
        switch (data.type) {
            case "connection_ack":
                socket.send(JSON.stringify({
                    id: "1",
                    type: "start",
                    payload: {
                        query: query,
                        variables: variables,
                    },
                }))
                break
            case "ka":
                break
            case "data":
                // A subscription payload can carry errors and still arrive as a
                // "data" message - a null in a non-null field nulls the whole
                // payload. Log them like the query path does, so a subscription
                // that silently delivers nothing is visible.
                if (data.payload.errors && data.payload.errors.length) {
                    console.log("error with graphql subscription payload")
                    console.log(data.payload.errors)
                }
                callback(data.payload.data)
                break
            default:
                console.log(data)
        }
    }
    socket.onopen = () => {
        resetWatchdog()
        socket.send(JSON.stringify({
            type: "connection_init",
        }))
        onopen()
    }
    socket.onerror = (err) => {
        // Force the socket closed so onclose fires and the renderer's reconnect
        // loop runs; ws normally emits close after an error, but a stalled
        // connection may not, so terminate to be sure.
        socket.terminate()
    }
    socket.onclose = () => {
        clearWatchdog()
        if (sockets[id]) {
            delete sockets[id]
        }
        onclose()
    }
    sockets[id] = socket
}

const httpUrlToWs = (url) => {
    return url.replace(/^(http)(s)?:\/\//, "ws$2://")
}

// Network errors worth retrying: a brief connectivity blip shouldn't fail a
// query outright (this is the ECONNRESET that was spamming the handler logs).
const TransientErrorCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "EAI_AGAIN", "ENOTFOUND"]

const GraphQL = async ({network, query, variables, retries = 3}) => {
    const body = JSON.stringify({
        query: query,
        variables: variables,
    })
    return new Promise((resolve, reject) => {
        const retryOrReject = (error) => {
            if (retries > 0 && TransientErrorCodes.includes(error.code)) {
                setTimeout(() => GraphQL({network, query, variables, retries: retries - 1})
                    .then(resolve, reject), 1000)
                return
            }
            reject(error)
        }
        let schema = http;
        if (network.Server.startsWith("https")) {
            schema = https;
        }
        const request = schema.request(network.Server + "/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": body.length,
            },
        }, (res) => {
            let data = "";
            res.on("data", d => {
                data += d
            })
            res.on("end", () => {
                try {
                    const jsonData = JSON.parse(data)
                    if (jsonData.errors && jsonData.errors.length) {
                        console.log("error with graphql response")
                        console.log(jsonData.errors)
                        reject(jsonData.errors)
                        return
                    }
                    resolve(jsonData)
                } catch (e) {
                    reject(e)
                }
            })
        })
        request.on("error", error => {
            retryOrReject(error)
        })
        request.write(body)
        request.end()
    })
}


module.exports = {
    GraphQL: GraphQL,
    Subscribe: Subscribe,
    CloseSocket: CloseSocket,
}
