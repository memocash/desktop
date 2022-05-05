const http = require("http")
const WebSocket = require('ws');

const Subscribe = async ({query, variables, callback}) => {
    let socket = new WebSocket("ws://127.0.0.1:26770/graphql", "graphql-ws")
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
            default:
                console.log(data)
                callback(data)
        }
    }
    socket.onopen = () => {
        socket.send(JSON.stringify({
            type: "connection_init",
        }))
    }
    socket.onerror = (err) => {
        console.log("GraphQL subscribe error!")
        console.log(err)
    }
    socket.onclose = (ev) => {
        console.log("GraphQL subscribe close!")
        console.log(ev)
    }
}

const GraphQL = async ({query, variables}) => {
    const body = JSON.stringify({
        query: query,
        variables: variables,
    })
    return new Promise((resolve, reject) => {
        const request = http.request("http://127.0.0.1:26770/graphql", {
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
                    console.log("error parsing json response", e)
                    reject(e)
                }
            })
        })
        request.on("error", error => {
            console.log("got error")
            reject(error)
        })
        request.write(body)
        request.end()
    })
}


module.exports = {
    GraphQL: GraphQL,
    Subscribe: Subscribe,
}
