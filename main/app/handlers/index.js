const {GraphQLHandlers} = require("./graphql");
const {ProfileHandlers} = require("./profile");
const {WalletHandlers} = require("./wallet");
const {WindowHandlers} = require("./window");
const {WindowTxHandlers} = require("./window_tx");
const {DataHandlers} = require("./data");

module.exports = {
    AllHandlers: () => {
        DataHandlers()
        GraphQLHandlers()
        ProfileHandlers()
        WalletHandlers()
        WindowHandlers()
        WindowTxHandlers()
    },
}
