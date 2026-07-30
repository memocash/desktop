const {Dir} = require("./dir");
const {WalletErrors} = require("./errors");
const {Modals} = require("./modals");
const {GetId} = require("./id");
const {Handlers, Listeners} = require("./handlers");
const {DefaultHiddenTabs, Tabs, ToggleableTabs} = require("./tabs");

module.exports = {
    DefaultHiddenTabs: DefaultHiddenTabs,
    Dir: Dir,
    Handlers: Handlers,
    Listeners: Listeners,
    Modals: Modals,
    GetId: GetId,
    WalletErrors: WalletErrors,
    Tabs: Tabs,
    ToggleableTabs: ToggleableTabs,
}
