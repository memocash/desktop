const {ipcMain} = require("electron");
const {GraphQL, Subscribe, CloseSocket} = require("../../client/graphql");
const {Handlers, Listeners} = require("../../common/util");

const GraphQLHandlers = () => {
    ipcMain.handle(Handlers.GraphQL, async (e, {query, variables}) => GraphQL({query, variables}))
    ipcMain.on(Handlers.GraphQLSubscribe, (e, {id, query, variables}) => {
        const onopen = (data) => {
            !e.sender.isDestroyed() && e.sender.send(Listeners.GraphQLOpenPrefix + id, data)
        }
        const callback = (data) => {
            !e.sender.isDestroyed() && e.sender.send(Listeners.GraphQLDataPrefix + id, data)
        }
        const onclose = (data) => {
            !e.sender.isDestroyed() && e.sender.send(Listeners.GraphQLClosePrefix + id, data)
        }
        Subscribe({id, query, variables, callback, onopen, onclose})
    })
    ipcMain.on(Handlers.GraphQLSubscribeClose, (e, {id}) => CloseSocket({id}))
}

module.exports = {
    GraphQLHandlers: GraphQLHandlers,
}
