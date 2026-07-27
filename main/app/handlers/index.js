const {GraphQLHandlers} = require("./graphql");
const {ProfileHandlers} = require("./profile");
const {WalletHandlers} = require("./wallet");
const {WindowHandlers} = require("./window");
const {WindowTxHandlers} = require("./window_tx");
const {DataHandlers} = require("./data");
const {ThemeHandlers} = require("./theme");
const {UpdateHandlers} = require("./update");

module.exports = {
    AllHandlers: () => {
        DataHandlers()
        GraphQLHandlers()
        ProfileHandlers()
        ThemeHandlers()
        UpdateHandlers()
        WalletHandlers()
        WindowHandlers()
        WindowTxHandlers()
    },
}
