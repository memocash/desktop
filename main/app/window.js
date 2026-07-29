const {BrowserWindow, nativeTheme, screen, shell} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const menu = require("../menu");
const {ForgetPaths} = require("./keystore");

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

const wallets = {}
const storage = {}
const windows = {}
const menus = {}
const networkOptions = {}
const txWindows = {}
const txWindowIds = new Set()
let windowNumber = 0

// Picking a wallet in a file dialog authorizes that window to open that file.
// The grant goes when the window does, so an import doesn't leave the path
// reachable by whatever window is handed the same id later.
const ForgetPathsOnClose = (win) => {
    const winId = win.webContents.id
    win.webContents.once("destroyed", () => ForgetPaths(winId))
}

const GetMenu = (winId) => menus[winId]
const GetNetworkOption = (winId) => networkOptions[winId]
const GetStorage = (winId) => storage[winId]
const GetWallet = (winId) => wallets[winId]
const GetWindow = (winId) => windows[winId]
// True once a wallet has been loaded in the window, which is also when it starts
// rendering the modal viewer. Transaction windows inherit the parent's wallet
// but have no modals, so they are excluded.
const IsWalletWindow = (winId) => wallets[winId] !== undefined && !txWindowIds.has(winId)
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
        webPreferences: WebPreferences,
        icon: AppIcon,
    })
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"}
    });
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    windows[win.webContents.id] = win
    ForgetPathsOnClose(win)
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
    if (txWindows[winId] === undefined) {
        txWindows[winId] = []
    }
    txWindowIds.add(win.webContents.id)
    menus[win.webContents.id] = menu.SimpleMenu(win, true)
    txWindows[winId].push(win)
    windows[win.webContents.id] = win
    ForgetPathsOnClose(win)
    wallets[win.webContents.id] = wallets[winId]
    networkOptions[win.webContents.id] = networkOptions[winId]
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
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetRuntimeNetworkOption,
    GetWallet,
    GetWindow,
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    CreateWindow,
    CreateTxWindow,
}
