const {ipcMain, Menu, MenuItem, app, dialog} = require("electron");
const {Dir, Handlers, Modals, Listeners} = require("../../common/util");
const {GetMenu, GetStorage, SetStorage, GetWindow, SetNetworkOption, GetNetworkOption} = require("../window");

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
    ipcMain.handle(Handlers.RightClickMenu, (e, address) => {
        const win = GetWindow(e.sender.id)
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Private Key",
            click: () => {
                win.webContents.send(Listeners.DisplayModal, Modals.Key, {address})
            },
        }))
        menu.popup({window: win})
    })
    ipcMain.handle(Handlers.CoinsMenu, async (e, hash, index) => {
        const win = GetWindow(e.sender.id)
        const clipboard = require("electron").clipboard
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Copy",
            click: () => {
                let copyText = hash + ":" + index
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
    ipcMain.handle(Handlers.GetWindowNetwork, async (e) => GetNetworkOption(e.sender.id))
    ipcMain.handle(Handlers.SetWindowNetwork, async (e, networkOption) => SetNetworkOption(e.sender.id, networkOption))
}

module.exports = {
    WindowHandlers: WindowHandlers,
}
