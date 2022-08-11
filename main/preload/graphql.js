const {ipcRenderer} = require("electron");
const {Handlers, GetId, Listeners} = require("../common/util");

module.exports = {
    graphQL: async (query, variables) => await ipcRenderer.invoke(Handlers.GraphQL, {query, variables}),
    listenGraphQL: ({query, variables, handler, onopen, onclose}) => {
        const id = GetId()
        ipcRenderer.on(Listeners.GraphQLDataPrefix + id, (evt, data) => {
            handler(data)
        })
        if (typeof onclose == "function") {
            ipcRenderer.on(Listeners.GraphQLClosePrefix + id, (evt, data) => {
                onclose(data)
            })
        }
        if (typeof onopen == "function") {
            ipcRenderer.on(Listeners.GraphQLOpenPrefix + id, (evt, data) => {
                onopen(data)
            })
        }
        ipcRenderer.send(Handlers.GraphQLSubscribe, {id, query, variables})
    },
}
