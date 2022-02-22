const http = require("http")

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
}
