const {ipcMain} = require("../ipc");
const {GraphQL, Subscribe, CloseSocket} = require("../../client/graphql");
const {Handlers, Listeners} = require("../../common/util");
const {GetNetworkOption} = require("../window");

const GraphQLHandlers = () => {
    ipcMain.handle(Handlers.GraphQL, async (e, {query, variables}) =>
        GraphQL({network: GetNetworkOption(e.sender.id), query, variables}))
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
        // The window half of the socket's name comes from the sender, so one
        // window's subscriptions are never reachable by another window's ids.
        Subscribe({
            network: GetNetworkOption(e.sender.id), windowId: e.sender.id,
            id, query, variables, callback, onopen, onclose,
        })
    })
    ipcMain.on(Handlers.GraphQLSubscribeClose, (e, {id}) => CloseSocket({windowId: e.sender.id, id}))
}

module.exports = {
    GraphQLHandlers: GraphQLHandlers,
}
