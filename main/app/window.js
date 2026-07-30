const {BrowserWindow, nativeTheme, screen, shell} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const menu = require("../menu");
const {ForgetPaths} = require("./keystore");
const {
    AddTxWindow,
    ForgetWindow,
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetTxWindows,
    GetWallet,
    GetWindow,
    IsOpen,
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    SetWindow,
} = require("./window_state");

// Dev loads the Next dev server; prod loads the static export served over the
// app:// protocol (see main/index.js). The rest of the URL is identical.
const AppUrl = isDev ? "http://localhost:8000" : "app://-";
const AppIcon = path.join(__dirname, "..", "..", "build", "icon.png")

// Match the CSS --bg values so the window paints the right base color before
// the renderer loads (avoids a light flash when opening in dark mode).
const BackgroundColor = () => nativeTheme.shouldUseDarkColors ? "#1b1c1e" : "#eeeeee"

// The renderer gets Buffer and its crypto shims from the webpack build, not from
// Electron, so node integration buys it nothing and would turn any script that
// makes it onto the page into full process access. Context isolation keeps the
// preload's contextBridge surface the only route from the page into main. The
// preload is bundled before launch because a sandboxed preload can load
// Electron's bridge module but cannot resolve our relative CommonJS modules.
const WebPreferences = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: path.join(__dirname, "..", "preload.bundle.cjs"),
}

let windowNumber = 0

// Everything a window puts in the state maps outlives it otherwise: its wallet
// metadata and the key that authenticates that metadata on disk, its menu, its
// network choice, the paths a file dialog authorized it to open, and the window
// object itself - all held for the life of the process, however many wallets
// have been opened and closed since. Clear them when the window's contents are
// destroyed, so closing a wallet actually puts it away and a later window handed
// the same id starts with nothing. A transaction window also names the window it
// was opened from, which is where the list holding it lives.
const ForgetWindowOnClose = (win, parentId) => {
    const winId = win.webContents.id
    win.webContents.once("destroyed", () => {
        ForgetPaths(winId)
        ForgetWindow(winId, parentId)
    })
}

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
        webPreferences: WebPreferences,
        icon: AppIcon,
    })
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"}
    });
    SetMenu(win.webContents.id, menu.SimpleMenu(win, true))
    SetWindow(win.webContents.id, win)
    ForgetWindowOnClose(win)
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
        webPreferences: WebPreferences,
        icon: AppIcon,
    })
    AddTxWindow(winId, win.webContents.id, win)
    SetMenu(win.webContents.id, menu.SimpleMenu(win, true))
    SetWindow(win.webContents.id, win)
    ForgetWindowOnClose(win, winId)
    SetWallet(win.webContents.id, GetWallet(winId))
    SetNetworkOption(win.webContents.id, GetNetworkOption(winId))
    let params = {txHash}
    if (!txHash || !txHash.length) {
        params = {inputs, outputs, beatHash}
    }
    await win.loadURL(AppUrl + "/tx?" + (new URLSearchParams(params)).toString())
}

const DevelopmentDatabaseFile = "~/.memo/memo-local.db"
const ProductionDatabaseFile = "~/.memo/memo.db"

// Keep local development isolated from the database used by packaged builds.
// Resolve this at the main-process boundary instead of persisting the dev path
// in network.json, which could otherwise make a later packaged run use it too.
const GetRuntimeNetworkOption = (option) => {
    if (!isDev || !option || option.DatabaseFile !== ProductionDatabaseFile) {
        return option
    }
    return {...option, DatabaseFile: DevelopmentDatabaseFile}
}

const eConf = (e) => GetRuntimeNetworkOption(GetNetworkOption(e.sender.id))

module.exports = {
    eConf,
    GetTxWindows,
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetRuntimeNetworkOption,
    GetWallet,
    GetWindow,
    IsOpen,
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    CreateWindow,
    CreateTxWindow,
}
