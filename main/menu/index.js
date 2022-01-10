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

    win.setMenu(menu)
    win.setMenuBarVisibility(true)
}

const NoMenu = (win) => {
    const menu = Menu.buildFromTemplate([{
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
    win.setMenu(menu)
    win.setMenuBarVisibility(false)
}

module.exports = {
    ShowMenu,
    NoMenu,
}
