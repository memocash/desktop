// The wallet window's tab strip. Shared with the main process because the View
// menu turns tabs on and off by name, and the renderer has to start with the
// same set hidden as the menu starts unchecked.
const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
    Tokens: "tokens",
    Memo: "memo",
    Chat: "chat",
    Notifications: "notifications",
    Log: "log",
}

// Tabs most users never need, so View lets them be hidden. Electron keeps the
// checked state on the menu item itself; `checked` here is only the state each
// item starts in. The Log is off by default - it's a diagnostic view, shown
// when someone wants to know what the app is doing.
const ToggleableTabs = [
    {label: "Show Addresses", tab: Tabs.Addresses, checked: true},
    {label: "Show Coins", tab: Tabs.Coins, checked: true},
    {label: "Show Log", tab: Tabs.Log, checked: false},
]

const DefaultHiddenTabs = ToggleableTabs.filter(({checked}) => !checked).map(({tab}) => tab)

module.exports = {
    Tabs: Tabs,
    ToggleableTabs: ToggleableTabs,
    DefaultHiddenTabs: DefaultHiddenTabs,
}
