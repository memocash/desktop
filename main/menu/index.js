const {Menu} = require("electron");
const {Modals} = require("../common/util");

const isMac = process.platform === "darwin"

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
            {label: "Information"},
            {type: "separator"},
            {
                label: "Seed",
                click: () => {
                    win.webContents.send("display-modal", Modals.Seed)
                },
                enabled: !!wallet.seed,
            },
        ]
    }, {
        label: "View",
        submenu: [
            {
                label: "Profile",
                click: () => {
                    win.webContents.send("display-modal", Modals.Profile)
                }
            },
            {label: "Show Addresses"},
            {label: "Show Coins"},
        ]
    }, {
        label: "Tools",
        submenu: [
            {label: "Preferences"},
            {label: "Network"},
        ]
    }, {
        label: "Help",
        submenu: [
            {label: "About"},
            {role: 'reload'},
            {role: 'forceReload'},
            {
                label: "Developer Tools",
                accelerator: "CommandOrControl+Shift+I",
                click: () => {
                    win.webContents.openDevTools()
                },
            },
        ]
    }])
    if (isMac) {
        Menu.setApplicationMenu(menu)
        return menu
    }
    win.setMenu(menu)
    win.setMenuBarVisibility(true)
}

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
            {
                label: "Developer Tools",
                accelerator: "CommandOrControl+Shift+I",
                click: () => {
                    win.webContents.openDevTools()
                },
            },
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
