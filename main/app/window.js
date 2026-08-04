const {app, BrowserWindow, nativeTheme, screen, shell} = require("electron");
const path = require("path");
const isDev = !app.isPackaged;
const menu = require("../menu");
const {IsSameOrigin, SafeExternalUrl} = require("../common/util");
const {AppUrl} = require("./ipc");
const {ForgetPaths} = require("./keystore");
const {
    AddTxWindow,
    CopyPublicToFileWindows,
    CopyWalletToTxWindows,
    ForgetWindow,
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetWallet,
    GetWindow,
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    SetWindow,
    TxWindowIds,
    TxWindowParent,
} = require("./window_state");

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
// the same id starts with nothing.
const ForgetWindowOnClose = (win) => {
    const winId = win.webContents.id
    win.webContents.once("destroyed", () => {
        // The transaction windows this one opened close with it. They show the
        // wallet this window held and spend on this window's session, so with
        // the wallet put away they are windows nobody can act in. Read before
        // the forgetting below, and closed after it, so a child's own destroyed
        // handler - which runs this same code, closing grandchildren in turn -
        // sees the parent already gone. Not Electron's parent option, which
        // would also pin every preview on top of the wallet window.
        const children = TxWindowIds(winId)
        ForgetPaths(winId)
        ForgetWindow(winId)
        for (const childId of children) {
            const child = GetWindow(childId)
            if (child && !child.isDestroyed()) {
                child.close()
            }
        }
    })
}

// The single point where a url from a renderer reaches the operating system.
// Anything that isn't plain http(s) is dropped rather than passed on - see
// SafeExternalUrl for what that keeps out and why.
const OpenExternalUrl = (url) => {
    const safeUrl = SafeExternalUrl(url)
    if (!safeUrl) {
        console.log("OpenExternalUrl: refusing to open " + url)
        return
    }
    shell.openExternal(safeUrl)
}

// Both window types load the wallet preload, so a page from anywhere but the app
// itself would come up holding the wallet bridge. Two things have to be closed
// for that to be true:
//
// - Opening a window (window.open, target="_blank") is always denied. A child
//   window inherits the preload, and nothing installs these handlers on it, so
//   allowing one would hand a page the bridge with no checks left. Valid links
//   go to the user's browser instead.
// - Navigating away from the app origin is blocked outright. Every legitimate
//   external link in the app routes through OpenExternalUrl, so a navigation to
//   somewhere else is either a bug or someone trying to load their own page into
//   a window that can read the wallet.
//
// Applied to every WebContents from one app-level hook (see main/index.js)
// rather than opted into per window. Per-window application drifted before:
// only the main window installed an open handler, which left the transaction
// viewer - the window that renders arbitrary on-chain urls - as the one
// without it. A hook on web-contents-created cannot miss a window, present or
// future, the spend prompt included.
const ApplyContentsSecurity = (contents) => {
    contents.setWindowOpenHandler(({url}) => {
        OpenExternalUrl(url)
        return {action: "deny"}
    })
    // will-navigate sees where a page asked to go; will-redirect sees where a
    // server answering a permitted navigation is sending it instead. app://
    // serves local files and cannot redirect, but the dev server origin can, so
    // the same rule is applied at both points. Programmatic loads by main
    // (loadURL, loadFile) fire neither event, so the spend prompt's file: page
    // still loads while anywhere the page itself asks to go is held to the app
    // origin.
    for (const event of ["will-navigate", "will-redirect"]) {
        contents.on(event, (e, url) => {
            if (IsSameOrigin(url, AppUrl + "/")) {
                return
            }
            e.preventDefault()
            console.log(event + ": blocked navigation to " + url)
        })
    }
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
    AddTxWindow(winId, win.webContents.id)
    SetMenu(win.webContents.id, menu.SimpleMenu(win, true))
    SetWindow(win.webContents.id, win)
    ForgetWindowOnClose(win)
    // The wallet as the parent holds it, minus its session. A transaction window
    // has no key of its own - the key belongs to the document that unlocked the
    // wallet - so a sealed password here could never be opened, and would go on
    // sitting in this window's state after the parent had ended its session.
    // Later changes to the parent's wallet are copied over in rememberWallet.
    SetWallet(win.webContents.id, {...GetWallet(winId), session: undefined})
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
    ApplyContentsSecurity,
    BackgroundColor,
    CopyPublicToFileWindows,
    CopyWalletToTxWindows,
    OpenExternalUrl,
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
    TxWindowParent,
}
