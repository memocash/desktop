const http = require("http")
const WebSocket = require('ws');

const sockets = {}

const CloseSocket = ({id}) => {
    if (!sockets[id]) {
        return
    }
    sockets[id].close()
    delete sockets[id]
}

const Subscribe = ({network, id, query, variables, callback, onopen, onclose}) => {
    let socket = new WebSocket(httpUrlToWs(network.Server) + "/graphql")
    socket.onmessage = (ev) => {
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
                callback(data.payload.data)
                break
            default:
                console.log(data)
        }
    }
    socket.onopen = () => {
        socket.send(JSON.stringify({
            type: "connection_init",
        }))
        onopen()
    }
    socket.onerror = (err) => {
        /*console.log("GraphQL subscribe error!")
        console.log(err)*/
    }
    socket.onclose = () => {
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

const GraphQL = async ({network, query, variables}) => {
    const body = JSON.stringify({
        query: query,
        variables: variables,
    })
    return new Promise((resolve, reject) => {
        const request = http.request(network.Server + "/graphql", {
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
                    }
                    resolve(jsonData)
                } catch (e) {
                    reject(e)
                }
            })
        })
        request.on("error", error => {
            reject(error)
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
