const {Menu} = require("electron");

const isMac = process.platform === "darwin"

const ShowMenu = (win, newWindow) => {
    let submenu = [
        {
            label: "New/Restore",
            click: async () => {
                newWindow()
            },
        },
        {type: "separator"},
    ]
    if(isMac) {
        submenu = [
            ...submenu,
            {role: "hide"},
            {role: "hideOthers"},
            {role: "unhide"},
            {type: "separator"},
            {role: "quit"},
        ]
    } else {
        submenu = [
            ...submenu,
            {role: "quit"},
        ]
    }
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
            {label: "Seed"},
        ]
    }, {
        label: "View",
        submenu: [
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

const NoMenu = (win) => {
    let submenu = [
        {role: "quit"},
    ]
    if(isMac) {
        submenu = [
            {role: "hide"},
            {role: "hideOthers"},
            {role: "unhide"},
            {type: "separator"},
            ...submenu
        ]
    }
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
    win.setMenuBarVisibility(false)
}

module.exports = {
    ShowMenu,
    NoMenu,
}
