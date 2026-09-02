const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

module.exports = {
    graphQL: async (query, variables) => await ipcRenderer.invoke(Handlers.GraphQL, {query, variables}),
}
