const {GraphQLHandlers} = require("./graphql");
const {ProfileHandlers} = require("./profile");
const {WalletHandlers} = require("./wallet");
const {WindowHandlers} = require("./window");
const {WindowTxHandlers} = require("./window_tx");
const {DataHandlers} = require("./data");
const {ThemeHandlers} = require("./theme");
const {UpdateHandlers} = require("./update");
const {SpendPromptHandlers} = require("../spend_prompt");
const {SyncHandlers} = require("./sync");

module.exports = {
    AllHandlers: () => {
        DataHandlers()
        GraphQLHandlers()
        ProfileHandlers()
        SpendPromptHandlers()
        SyncHandlers()
        ThemeHandlers()
        UpdateHandlers()
        WalletHandlers()
        WindowHandlers()
        WindowTxHandlers()
    },
}
