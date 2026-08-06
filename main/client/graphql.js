const http = require("http");
const https = require("https");
const WebSocket = require('ws');

// The server serializes 64-bit token amounts as bare JSON numbers, and plain
// JSON.parse would round anything past 2^53 to the nearest float before this
// process ever saw the digits. The reviver's source access reads the digits
// themselves, so an integer a number cannot hold exactly arrives as a BigInt
// instead, and every other value keeps its usual shape. Only plain digit runs
// are promoted: an oversized value in scientific notation stays the float it
// always was rather than becoming a parse error.
const exactInteger = (key, value, context) =>
    typeof value === "number" && !Number.isSafeInteger(value) &&
    /^-?\d+$/.test(context.source) ? BigInt(context.source) : value

const ParseJson = (text) => JSON.parse(text, exactInteger)

// Subscriptions are held per window as well as per id: the id is whatever the
// renderer chose, and with one flat namespace any window could close another's
// subscription by guessing its id. The window half of the key comes from the
// sender in main, which no renderer picks for itself.
const sockets = {}

const socketKey = (windowId, id) => windowId + ":" + id

// A subscription frame arrives from whatever server the user configured. ws
// would buffer up to 100MB for a single frame before the handler ever sees
// it; no real subscription payload is within orders of magnitude of this cap,
// so past it the peer is either broken or hostile, and the socket closes.
const MaxFrameBytes = 8 * 1024 * 1024

const CloseSocket = ({windowId, id}) => {
    const key = socketKey(windowId, id)
    if (!sockets[key]) {
        return
    }
    sockets[key].close()
    delete sockets[key]
}

// Everything a window subscribed to goes when the window does - otherwise the
// sockets outlive their audience, holding connections and pushing frames at a
// callback whose sender is destroyed.
const CloseWindowSockets = (windowId) => {
    for (const key of Object.keys(sockets)) {
        if (key.startsWith(windowId + ":")) {
            sockets[key].close()
            delete sockets[key]
        }
    }
}

// If no traffic (not even server "ka" keepalives) arrives within this window we
// treat the socket as a dead zombie - a silent network drop that never
// delivered a clean close - and force it shut so onclose fires and the renderer
// reconnects.
const KeepAliveTimeoutMs = 60000

const Subscribe = ({network, windowId, id, query, variables, callback, onopen, onclose}) => {
    const key = socketKey(windowId, id)
    // Reusing an id ends the socket that was using it, rather than leaving
    // the old one connected under a name nothing can reach anymore.
    CloseSocket({windowId, id})
    let socket = new WebSocket(httpUrlToWs(network.Server) + "/graphql", {maxPayload: MaxFrameBytes})
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
        // The frame contents are whatever the server chose to send - and the
        // server is whatever the user typed into settings, possibly reached
        // over plaintext ws://. A frame that doesn't parse, or parses to a
        // shape the cases below don't expect, is that one peer speaking the
        // protocol wrong, not grounds for an uncaught throw in the process
        // every wallet window depends on. Terminate so onclose fires and the
        // renderer's reconnect loop takes over.
        try {
            const data = ParseJson(ev.data)
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
                    // A subscription payload can carry errors and still arrive
                    // as a "data" message - a null in a non-null field nulls
                    // the whole payload. Log them like the query path does, so
                    // a subscription that silently delivers nothing is visible.
                    if (data.payload.errors && data.payload.errors.length) {
                        console.log("error with graphql subscription payload")
                        console.log(data.payload.errors)
                    }
                    callback(data.payload.data)
                    break
                default:
                    console.log(data)
            }
        } catch (e) {
            console.log("malformed graphql subscription frame")
            console.log(e)
            socket.terminate()
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
        // Only its own entry: by the time an old socket's close fires, the
        // key may already name its replacement.
        if (sockets[key] === socket) {
            delete sockets[key]
        }
        onclose()
    }
    sockets[key] = socket
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
                // Bytes, not code units: a query carrying anything outside
                // ascii - a profile name, an emoji in a post - is longer on
                // the wire than in the string, and a short declared length
                // truncates the request body at the server.
                "Content-Length": Buffer.byteLength(body),
            },
        }, (res) => {
            let data = "";
            res.on("data", d => {
                data += d
            })
            res.on("end", () => {
                try {
                    const jsonData = ParseJson(data)
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
    ParseJson: ParseJson,
    Subscribe: Subscribe,
    CloseSocket: CloseSocket,
    CloseWindowSockets: CloseWindowSockets,
}
