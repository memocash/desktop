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
        ]
    }])

    win.setMenu(menu)
}

const NoMenu = (win) => {
    win.setMenu(null)
}

module.exports = {
    ShowMenu,
    NoMenu,
}
