const {BrowserWindow, nativeTheme, screen, shell} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const menu = require("../menu");

// Dev loads the Next dev server; prod loads the static export served over the
// app:// protocol (see main/index.js). The rest of the URL is identical.
const AppUrl = isDev ? "http://localhost:8000" : "app://-";
const AppIcon = path.join(__dirname, "..", "..", "build", "icon.png")

// Match the CSS --bg values so the window paints the right base color before
// the renderer loads (avoids a light flash when opening in dark mode).
const BackgroundColor = () => nativeTheme.shouldUseDarkColors ? "#1b1c1e" : "#eeeeee"

const wallets = {}
const storage = {}
const windows = {}
const menus = {}
const networkOptions = {}
const txWindows = {}
let windowNumber = 0

const GetMenu = (winId) => menus[winId]
const GetNetworkOption = (winId) => networkOptions[winId]
const GetStorage = (winId) => storage[winId]
const GetWallet = (winId) => wallets[winId]
const GetWindow = (winId) => windows[winId]
const SetMenu = (winId, menu) => menus[winId] = menu
const SetNetworkOption = (winId, option) => networkOptions[winId] = option
const SetStorage = (winId, data) => storage[winId] = data
const SetWallet = (winId, wallet) => wallets[winId] = wallet

const CreateWindow = async () => {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    let idOffset = 20 * windowNumber
    for (let i = 0; idOffset > currentScreen.bounds.height - 200 && i < 10; i++) {
        idOffset -= currentScreen.bounds.height - 200
    }
    const win = new BrowserWindow({
        x: currentScreenXValue + 200 + idOffset,
        y: 200 + idOffset,
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        title: "Memo",
        backgroundColor: BackgroundColor(),
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, "..", "preload", "index.js")
        },
        icon: AppIcon,
    })
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"}
    });
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    windows[win.webContents.id] = win
    await win.loadURL(AppUrl + "/")
    windowNumber++
}

const CreateTxWindow = async (winId, {txHash, inputs, outputs, beatHash}) => {
    const win = new BrowserWindow({
        width: 650,
        height: 500,
        minWidth: 650,
        minHeight: 300,
        title: "Transaction",
        backgroundColor: BackgroundColor(),
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, "..", "preload", "index.js")
        },
        icon: AppIcon,
    })
    if (txWindows[winId] === undefined) {
        txWindows[winId] = []
    }
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    txWindows[winId].push(win)
    windows[win.webContents.id] = win
    wallets[win.webContents.id] = wallets[winId]
    networkOptions[win.webContents.id] = networkOptions[winId]
    let params = {txHash}
    if (!txHash || !txHash.length) {
        params = {inputs, outputs, beatHash}
    }
    await win.loadURL(AppUrl + "/tx?" + (new URLSearchParams(params)).toString())
}

const eConf = (e) => GetNetworkOption(e.sender.id)

module.exports = {
    eConf,
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetWallet,
    GetWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    CreateWindow,
    CreateTxWindow,
}
