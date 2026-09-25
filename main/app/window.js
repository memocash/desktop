const {app, BrowserWindow, nativeTheme, screen, shell} = require("electron");
const path = require("path");
const menu = require("../menu");
const {IsSameOrigin, Listeners, SafeExternalUrl} = require("../common/util");
const {DataDirectory, InDataDirectory} = require("../common/util/network_config");
const {AppUrl} = require("./ipc");
const {ForgetPaths} = require("./keystore");
const {Discard: DiscardPendingSeed} = require("./pending_seed");
const {CloseWindowSockets} = require("../client/graphql");
const {
    AddLoadWindow,
    AddTxWindow,
    ForgetWindow,
    GetNetworkOption,
    GetWallet,
    GetWindow,
    SetMenu,
    SetNetworkOption,
    SetWallet,
    SetWindow,
    TxWindowIds,
} = require("./window_state");

const AppIcon = path.join(__dirname, "..", "..", "build", "icon.png")

// The load page - choose or create a wallet, type its password, write down a
// seed - is loaded from disk, the way the spend prompt is, and not over the
// app origin. On the app origin it would share an origin with the wallet
// page, and a compromised wallet page could frame it and script the frame's
// document: its password box, its seed words. A file: document is out of
// reach of an app:// or http: page altogether - Chromium refuses to frame or
// navigate to a local file from either, before any policy of ours is asked -
// so the pages that hold a wallet and the page that takes its password
// cannot meet, in dev or packaged, with nothing to configure. The page sits
// in the export beside the pages the app origin serves, but neither the
// app:// handler nor the dev server will serve it (see
// main/common/util/load_page.js), so no wallet page can navigate its own
// window to it either. What that gives up is the app:// handler: no header
// policy and no path containment for this one page, which is why its
// preload is its own and its channels are guarded by window rather than by
// url (see main/app/ipc.js).
const LoadPage = path.join(__dirname, "..", "..", "renderer", "out", "load", "index.html")
const LoadPreload = path.join(__dirname, "..", "preload.load.bundle.cjs")
const WalletPreload = path.join(__dirname, "..", "preload.bundle.cjs")

// Match the CSS --bg values so the window paints the right base color before
// the renderer loads (avoids a light flash when opening in dark mode).
const BackgroundColor = () => nativeTheme.shouldUseDarkColors ? "#1b1c1e" : "#eeeeee"

// The renderer gets Buffer and its crypto shims from the esbuild bundle, not
// from Electron, so node integration buys it nothing and would turn any script
// that makes it onto the page into full process access. Context isolation
// keeps the preload's contextBridge surface the only route from the page into
// main. The preload is bundled before launch because a sandboxed preload can
// load Electron's bridge module but cannot resolve our relative CommonJS
// modules. Which preload is the one choice a window makes: the wallet's, or
// the load page's, which can unlock a wallet and nothing else.
const WebPreferences = (preload) => ({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload,
})

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
        DiscardPendingSeed(winId)
        CloseWindowSockets(winId)
        ForgetWindow(winId)
        for (const childId of children) {
            const child = GetWindow(childId)
            if (child && !child.isDestroyed()) {
                child.close()
            }
        }
    })
}

// The subscriptions a page opened are the page's, not the window's. A reload
// or a navigation replaces the document that asked for them while the window
// and its WebContents live on, and the new document opens subscriptions of
// its own; nothing closes the old ones from the renderer side, because the
// page that would have is gone. So main closes every socket the window holds
// when its page goes: once a new document has committed (did-navigate), once
// an error page has committed in its place (did-fail-load - a failed load is
// not followed by did-navigate), or once the renderer process has died under
// it (render-process-gone). Everything held at any of those moments is the
// old page's - a new document cannot have asked for anything before its
// commit - and the closes that follow are dropped by the sync handler's frame
// check rather than delivered to a page that never asked.
const CloseSocketsWithPage = (win) => {
    const winId = win.webContents.id
    win.webContents.on("did-navigate", () => CloseWindowSockets(winId))
    win.webContents.on("did-fail-load", (e, code, description, url, isMainFrame) =>
        isMainFrame && CloseWindowSockets(winId))
    win.webContents.on("render-process-gone", () => CloseWindowSockets(winId))
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

// Every window loads a preload with a bridge into main, so a page from anywhere
// but the app itself would come up holding one. Two things have to be closed
// for that to be true:
//
// - Opening a window (window.open, target="_blank") is always denied. A child
//   window inherits the preload, and nothing installs these handlers on it, so
//   allowing one would hand a page the bridge with no checks left. Valid links
//   go to the user's browser instead.
// - Navigation the page asks for is allowed within the app origin and nowhere
//   else - and only for a page that is itself on the app origin. The windows
//   main loads from disk, the load page and the spend prompt, ask to go nowhere
//   at all: a file: document may navigate to another local file, and a window
//   holding the load preload must not be able to end up showing one. Every
//   legitimate external link in the app routes through OpenExternalUrl, so a
//   navigation anywhere else is either a bug or someone trying to load their
//   own page into a window that can read the wallet.
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
    // (loadURL, loadFile) fire neither event, so main's own loads - the load
    // page and the spend prompt from disk, the wallet pages from the app
    // origin - go through, while anywhere a page itself asks to go is held to
    // the app origin, from the app origin. A window with no document yet is
    // main's to load and is treated as on the app origin for a redirect of
    // that first load.
    for (const event of ["will-navigate", "will-redirect"]) {
        contents.on(event, (e, url) => {
            const here = contents.getURL()
            const fromApp = !here || IsSameOrigin(here, AppUrl + "/")
            if (fromApp && IsSameOrigin(url, AppUrl + "/")) {
                return
            }
            e.preventDefault()
            console.log(event + ": blocked navigation to " + url + " from " + (here || "a new window"))
        })
    }
}

// Where the next load window goes: stepped down the screen from the last, so
// windows opened one after another do not stack exactly.
const NextWindowBounds = () => {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint())
    const currentScreenXValue = currentScreen.bounds.x
    let idOffset = 20 * windowNumber
    for (let i = 0; idOffset > currentScreen.bounds.height - 200 && i < 10; i++) {
        idOffset -= currentScreen.bounds.height - 200
    }
    windowNumber++
    return {x: currentScreenXValue + 200 + idOffset, y: 200 + idOffset, width: 800, height: 600}
}

const mainWindow = (bounds, preload) => new BrowserWindow({
    ...bounds,
    minWidth: 600,
    minHeight: 400,
    title: "Memo",
    backgroundColor: BackgroundColor(),
    webPreferences: WebPreferences(preload),
    icon: AppIcon,
})

// The window a person chooses or creates a wallet in: the app's first window,
// and what File > New/Restore opens. It is a load window from the moment it
// exists - registered before its page loads, so nothing it sends is ever
// refused for arriving early - and stays one until it closes, which it does on
// its own once the wallet it unlocked has a window (see OpenWalletWindow).
const OpenLoadWindow = async () => {
    const win = mainWindow(NextWindowBounds(), LoadPreload)
    AddLoadWindow(win.webContents.id)
    SetMenu(win.webContents.id, menu.SimpleMenu(win))
    SetWindow(win.webContents.id, win)
    ForgetWindowOnClose(win)
    CloseSocketsWithPage(win)
    await win.loadFile(LoadPage)
}

// The window a wallet lives in, opened by main once a load window has unlocked
// or created one. The load window never holds the wallet: its state is bound
// to the new window's id from the start, along with the network the load page
// chose, and the load window is closed once the new one has loaded in its
// place. The wallet page comes up with no idea which window it replaced.
//
// The session key is what used to go back to the preload that asked to
// unlock. That preload is the load page's now, which must not hold a spend
// credential, so the key waits here - for as long as the page takes to load,
// in this call and nowhere else - and is sent to the new window's preload as
// soon as that exists to receive it. A window that closes before then takes
// the key with it: main's half of the session then opens for nobody, and the
// next spend asks for the password, the same as after a reload.
//
// A load that fails - the dev server gone between login and here, a window
// closed while loading - leaves nothing behind either: the window is
// destroyed, which runs the same forgetting a closed window's does, the
// delivery waiting on it is withdrawn so the key is held by nothing, and the
// failure goes back to the load window, which stays open for another try
// rather than being closed onto a wallet window that never came up.
// The network a load window chose, which the wallet window it opens is set
// onto. Unlocking and creating ask this first, before a file is read or
// written or a pending seed spent, so a window that chose nothing is refused
// at no cost; the check here is the one that holds for the window itself.
const RequireNetworkOption = (loadWinId) => {
    const networkOption = GetNetworkOption(loadWinId)
    if (!networkOption) {
        throw new Error("no network has been selected for this wallet")
    }
    return networkOption
}

const OpenWalletWindow = async (loadWinId, state, sessionKey) => {
    const networkOption = RequireNetworkOption(loadWinId)
    const loadWin = GetWindow(loadWinId)
    const bounds = loadWin && !loadWin.isDestroyed() ? loadWin.getBounds() : NextWindowBounds()
    const win = mainWindow(bounds, WalletPreload)
    const winId = win.webContents.id
    SetMenu(winId, menu.SimpleMenu(win))
    SetWindow(winId, win)
    SetWallet(winId, state)
    SetNetworkOption(winId, networkOption)
    ForgetWindowOnClose(win)
    CloseSocketsWithPage(win)
    // The preload registers its listener before the document exists, so the
    // earliest the key can be delivered is the earliest it is held.
    const deliverKey = () => win.webContents.send(Listeners.SessionKey, sessionKey)
    if (sessionKey) {
        win.webContents.once("dom-ready", deliverKey)
    }
    try {
        await win.loadURL(AppUrl + "/wallet")
    } catch (e) {
        // A window destroyed under the load took its listeners and its state
        // with it already; one still standing is put away here.
        if (!win.isDestroyed()) {
            win.webContents.off("dom-ready", deliverKey)
            win.destroy()
        }
        throw e
    }
    const opener = GetWindow(loadWinId)
    if (opener && !opener.isDestroyed()) {
        opener.close()
    }
    return winId
}

const CreateTxWindow = async (winId, {txHash, inputs, outputs, beatHash}) => {
    const win = new BrowserWindow({
        width: 650,
        height: 500,
        minWidth: 650,
        minHeight: 300,
        title: "Transaction",
        backgroundColor: BackgroundColor(),
        webPreferences: WebPreferences(WalletPreload),
        icon: AppIcon,
    })
    AddTxWindow(winId, win.webContents.id)
    SetMenu(win.webContents.id, menu.SimpleMenu(win))
    SetWindow(win.webContents.id, win)
    ForgetWindowOnClose(win)
    CloseSocketsWithPage(win)
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

// Which directory under ~/.memo this build's databases live in, decided once
// here at the main-process boundary rather than persisted in network.json,
// which could otherwise make a later packaged run use it too. The rule is
// DataDirectory's; a bad MEMO_DATA stops the app here, at load, with its reason.
const DataDir = DataDirectory(app.isPackaged, process.env.MEMO_DATA)

const GetRuntimeNetworkOption = (option) => option ? InDataDirectory(option, DataDir) : option

const eConf = (e) => GetRuntimeNetworkOption(GetNetworkOption(e.sender.id))

// Only what this module defines: window state accessors live in
// window_state and are imported from there directly.
module.exports = {
    eConf,
    ApplyContentsSecurity,
    BackgroundColor,
    DataDir,
    CloseSocketsWithPage,
    OpenExternalUrl,
    GetRuntimeNetworkOption,
    OpenLoadWindow,
    OpenWalletWindow,
    RequireNetworkOption,
    CreateTxWindow,
}
