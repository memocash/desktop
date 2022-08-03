const {ipcMain} = require("electron");
const {GraphQL, Subscribe} = require("../../client/graphql");
const {Handlers} = require("../../common/util");

const GraphQLHandlers = () => {
    ipcMain.handle(Handlers.GraphQL, async (e, {query, variables}) => {
        return GraphQL({query, variables})
    })
    ipcMain.on(Handlers.GraphQLSubscribe, (e, {id, query, variables}) => {
        const onopen = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-open-" + id, data)
        }
        const callback = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-data-" + id, data)
        }
        const onclose = (data) => {
            !e.sender.isDestroyed() && e.sender.send("graphql-close-" + id, data)
        }
        Subscribe({query, variables, callback, onopen, onclose})
    })
}

module.exports = {
    GraphQLHandlers: GraphQLHandlers,
}
