const {ipcMain, Menu, MenuItem, Notification, app, dialog} = require("electron");
const {Dir, Handlers, Modals, Listeners} = require("../../common/util");
const {
    GetMenu,
    GetStorage,
    SetStorage,
    GetWindow,
    GetWallet,
    SetNetworkOption,
    GetNetworkOption,
    GetRuntimeNetworkOption,
} = require("../window");

const WindowHandlers = () => {
    ipcMain.handle(Handlers.GetWindowId, async (e) => e.sender.id)
    ipcMain.on(Handlers.CloseWindow, (e) => GetWindow(e.sender.id).close())
    ipcMain.on(Handlers.SetWindowStorage, (e, key, value) => {
        if (GetStorage(e.sender.id) === undefined) {
            SetStorage(e.sender.id, {})
        }
        GetStorage(e.sender.id)[key] = value
    })
    ipcMain.handle(Handlers.GetWindowStorage, (e, key) => {
        if (GetStorage(e.sender.id) === undefined) {
            return undefined
        }
        return GetStorage(e.sender.id)[key]
    })
    ipcMain.handle(Handlers.RightClickMenu, async (e, address, wallet) => {
        const win = GetWindow(e.sender.id)
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Private Key",
            click: () => {
                win.webContents.send(Listeners.DisplayModal, Modals.Key, {address})
            },
        }))
        menu.append(new MenuItem({
            label: "Remove address",
            click: () => {
                win.webContents.send(Listeners.DisplayModal, Modals.Remove, {address})
            },
            enabled: !wallet.seed || wallet.seed.length === 0,
        },))
        menu.popup({window: win})
    })
    ipcMain.handle(Handlers.CoinsMenu, async (e, hash, index, value, address) => {
        const win = GetWindow(e.sender.id)
        const clipboard = require("electron").clipboard
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Copy",
            click: () => {
                let copyText = hash + ":" + index + ":" + value + ":" + address
                clipboard.writeText(copyText)

            },
        }))
        menu.popup({window: win})
    })
    app.on(Handlers.BrowserWindowFocus, (e, win) => {
        if (process.platform === "darwin") {
            Menu.setApplicationMenu(GetMenu(win.webContents.id))
        }
    })
    ipcMain.handle(Handlers.OpenFileDialog, async (e) => {
        const win = GetWindow(e.sender.id)
        const {canceled, filePaths} = await dialog.showOpenDialog(win, {defaultPath: Dir.DefaultPath})
        if (canceled) {
            return ""
        }
        return filePaths[0]
    })
    ipcMain.on(Handlers.ShowMessageDialog, (e, message) => {
        dialog.showMessageBoxSync(GetWindow(e.sender.id), {
            title: "Memo",
            message: message,
        })
    })
    ipcMain.on(Handlers.ShowNotification, (e, {title, body, tab} = {}) => {
        if (!Notification.isSupported()) {
            return
        }
        const notification = new Notification({title: title || "Memo", body: body || ""})
        notification.on("click", () => {
            const win = GetWindow(e.sender.id)
            if (!win) {
                return
            }
            if (win.isMinimized()) {
                win.restore()
            }
            win.show()
            win.focus()
            if (tab) {
                win.webContents.send(Listeners.SelectTab, tab)
            }
        })
        notification.show()
    })
    ipcMain.handle(Handlers.GetWindowNetwork, async (e) =>
        GetRuntimeNetworkOption(GetNetworkOption(e.sender.id)))
    ipcMain.handle(Handlers.SetWindowNetwork, async (e, networkOption) => SetNetworkOption(e.sender.id, networkOption))
}

module.exports = {
    WindowHandlers: WindowHandlers,
}
