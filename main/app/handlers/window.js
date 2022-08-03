const {ipcMain, Menu, MenuItem, app, dialog} = require("electron");
const {Dir, Handlers, Modals} = require("../../common/util");
const {GetMenu, GetStorage, SetStorage, GetWindow} = require("../window");

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
    ipcMain.handle(Handlers.RightClickMenu, (e) => {
        const win = GetWindow(e.sender.id)
        const menu = new Menu()
        menu.append(new MenuItem({
            label: "Private Key",
            click: () => {
                win.webContents.send("display-modal", Modals.Key)
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
}

module.exports = {
    WindowHandlers: WindowHandlers,
}
