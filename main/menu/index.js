const {Menu} = require("electron");

const ShowMenu = (win, newWindow) => {
    const menu = Menu.buildFromTemplate([{
        label: "File",
        submenu: [
            {
                label: "New/Restore",
                click: async () => {
                    newWindow()
                },
            },
            {type: "separator"},
            {role: "quit"},
        ]
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
            {
                label: "Developer Tools",
                accelerator: "CommandOrControl+Shift+I",
                click: () => {
                    win.webContents.openDevTools()
                },
            },
        ]
    }])
    if (process.platform === "darwin") {
        Menu.setApplicationMenu(menu)
        return menu
    }
    win.setMenu(menu)
    win.setMenuBarVisibility(true)
}

const NoMenu = (win) => {
    const menu = Menu.buildFromTemplate([{
        label: "File",
        submenu: [
            {role: "quit"},
        ]
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
            {
                label: "Developer Tools",
                accelerator: "CommandOrControl+Shift+I",
                click: () => {
                    win.webContents.openDevTools()
                },
            },
        ],
    }])
    if (process.platform === "darwin") {
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
