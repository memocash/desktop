const {app, Menu} = require("electron");
const {Modals, Listeners, ToggleableTabs} = require("../common/util");

const isMac = process.platform === "darwin"

// DevTools is a development tool, and in a shipped wallet it is also a console
// with the bridge in scope - the thing "paste this to get free coins" needs
// its victim to have a shortcut to. Packaged builds get neither the menu item
// nor its accelerator; nothing else binds one.
const DevToolsItems = (win) => app.isPackaged ? [] : [{
    label: "Developer Tools",
    accelerator: "CommandOrControl+Shift+I",
    click: () => {
        win.webContents.openDevTools()
    },
}]

const ShowMenu = (win, newWindow, wallet) => {
    const submenu = [
        {
            label: "New/Restore",
            accelerator: "CmdOrCtrl+N",
            click: async () => {
                newWindow()
            },
        },
        {type: "separator"},
        ...GetBasicFileSubMenu(),
    ]
    const menu = Menu.buildFromTemplate([{
        label: "File",
        submenu
    }, {
        label: "Edit",
        submenu: [
            {label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:"},
            {label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:"},
            {type: "separator"},
            {label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:"},
            {label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:"},
            {label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:"},
            {label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:"}
        ]
    }, {
        label: "Wallet",
        submenu: [
            {
                label: "Information",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.WalletInfo)
                },
            },
            {type: "separator"},
            {
                label: "Seed",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.Seed)
                },
                enabled: wallet.walletType === "seed",
            },
        ]
    }, {
        label: "View",
        submenu: [
            {
                label: "Profile",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.ProfileFind)
                }
            },
            {
                label: "Links",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.Links)
                }
            },
            {
                label: "Aliases",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.Aliases)
                }
            },
            {type: "separator"},
            ...TabToggles(win),
        ]
    }, {
        label: "Tools",
        submenu: [
            {label: "Preferences", click: () => win.webContents.send(Listeners.DisplayModal, Modals.Settings)},
            {label: "Network", click: () => win.webContents.send(Listeners.DisplayModal, Modals.NetworkView)},
            {
                label: "Edit Addresses/Keys",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.Address)
                },
                enabled: wallet.walletType !== "seed",
            }
        ]
    }, {
        label: "Help",
        submenu: [
            {
                label: "About",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.About)
                },
            },
            {
                label: "Check for Updates...",
                click: () => {
                    win.webContents.send(Listeners.DisplayModal, Modals.Update)
                },
            },
            {type: "separator"},
            {role: 'reload'},
            {role: 'forceReload'},
            ...DevToolsItems(win),
        ]
    }])
    if (isMac) {
        Menu.setApplicationMenu(menu)
        return menu
    }
    win.setMenu(menu)
    win.setMenuBarVisibility(true)
}

// Which tabs can be toggled, and which of them start on, lives in
// common/util/tabs - the renderer starts its tab strip from the same list.
const TabToggles = (win) => ToggleableTabs.map(({label, tab, checked}) => ({
    label,
    type: "checkbox",
    checked,
    click: (menuItem) => {
        win.webContents.send(Listeners.ToggleTab, tab, menuItem.checked)
    },
}))

const GetBasicFileSubMenu = () => {
    let submenu = [
        {role: "close"},
        {role: "quit"},
    ]
    if (isMac) {
        submenu = [
            {role: "hide"},
            {role: "hideOthers"},
            {role: "unhide"},
            {type: "separator"},
            ...submenu
        ]
    }
    return submenu
}

const SimpleMenu = (win, hide) => {
    const menu = Menu.buildFromTemplate([{
        label: "File",
        submenu: GetBasicFileSubMenu(),
    }, {
        label: "Edit",
        submenu: [
            {label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:"},
            {label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:"},
            {type: "separator"},
            {label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:"},
            {label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:"},
            {label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:"},
            {label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:"}
        ]
    }, {
        label: "Help",
        submenu: [
            {role: 'reload'},
            {role: 'forceReload'},
            ...DevToolsItems(win),
        ],
    }])
    if (isMac) {
        Menu.setApplicationMenu(menu)
        return menu
    }
    win.setMenu(menu)
    if (hide) {
        win.setMenuBarVisibility(false)
    }
}

module.exports = {
    ShowMenu,
    SimpleMenu: SimpleMenu,
}
