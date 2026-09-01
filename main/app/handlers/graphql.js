const {ipcMain} = require("../ipc");
const {GraphQL} = require("../../client/graphql");
const {Handlers} = require("../../common/util");
const {GetNetworkOption} = require("../window_state");

// One-off queries the renderer runs for itself and reads the answer of
// directly - broadcasting a signed transaction is the one that matters.
// Nothing that comes back through here is stored: every sync that writes to
// the database runs in main (see handlers/sync.js).
const GraphQLHandlers = () => {
    ipcMain.handle(Handlers.GraphQL, async (e, {query, variables}) =>
        GraphQL({network: GetNetworkOption(e.sender.id), query, variables}))
}

module.exports = {
    GraphQLHandlers: GraphQLHandlers,
}
