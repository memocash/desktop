const test = require("node:test")
const assert = require("node:assert")
const {EventEmitter} = require("node:events")

// ApplyContentsSecurity is what stands between a page that can read the wallet
// and a page from anywhere else: window opens always denied and routed to the
// browser, navigation held to the app origin. It is wired to every WebContents
// through main/index.js's web-contents-created hook; here the function is
// driven directly against a recording stand-in for a WebContents.
//
// OpenWalletWindow is the handoff from a load window to the window the
// wallet lives in. Its BrowserWindow is a stand-in whose load can be told to
// succeed, fail, or be destroyed midway, so what is under test is the state
// each outcome leaves: who holds the wallet, where the key went, and which
// windows are still standing.
const opened = []
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
// What the next window's loadURL does, set per test; and every window built.
let nextLoad = async () => undefined
let nextId = 100
const built = []
class FakeWindow {
    constructor(options) {
        this.options = options
        this.destroyed = false
        this.webContents = Object.assign(new EventEmitter(), {
            id: ++nextId,
            sent: [],
            getURL: () => "",
            send: (channel, ...args) => this.webContents.sent.push({channel, args}),
        })
        built.push(this)
    }
    isDestroyed() {
        return this.destroyed
    }
    getBounds() {
        return {x: 1, y: 2, width: 800, height: 600}
    }
    close() {
        this.destroy()
    }
    destroy() {
        if (!this.destroyed) {
            this.destroyed = true
            this.webContents.emit("destroyed")
        }
    }
    async loadURL(url) {
        this.loaded = url
        return nextLoad(this)
    }
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: () => undefined,
        on: () => undefined,
    },
    BrowserWindow: FakeWindow,
    nativeTheme: {},
    screen: {
        getCursorScreenPoint: () => ({x: 0, y: 0}),
        getDisplayNearestPoint: () => ({bounds: {x: 0, y: 0, height: 1000}}),
    },
    shell: {openExternal: (url) => opened.push(url)},
})
stub("../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})

const {ApplyContentsSecurity, OpenWalletWindow} = require("./window")
const {
    AddLoadWindow, ForgetWindow, GetNetworkOption, GetWallet, GetWindow, HeldWindowIds, SetNetworkOption, SetWindow,
} = require("./window_state")

const fakeContents = (url = "app://-/wallet") => {
    const contents = {listeners: {}, url}
    contents.setWindowOpenHandler = (fn) => contents.openHandler = fn
    contents.on = (event, fn) => contents.listeners[event] = fn
    contents.getURL = () => contents.url
    return contents
}

test("every window open is denied, with plain http(s) urls handed to the browser", () => {
    const contents = fakeContents()
    ApplyContentsSecurity(contents)
    opened.length = 0
    assert.deepEqual(contents.openHandler({url: "https://memo.cash/profile"}), {action: "deny"})
    assert.deepEqual(opened, ["https://memo.cash/profile"])
})

test("a window open to a scheme the OS would act on is denied and goes nowhere", () => {
    const contents = fakeContents()
    ApplyContentsSecurity(contents)
    opened.length = 0
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,<script></script>"]) {
        assert.deepEqual(contents.openHandler({url}), {action: "deny"})
    }
    assert.deepEqual(opened, [])
})

test("navigation and redirects away from the app origin are blocked, within it allowed", () => {
    const contents = fakeContents()
    ApplyContentsSecurity(contents)
    for (const event of ["will-navigate", "will-redirect"]) {
        const listener = contents.listeners[event]
        assert.ok(listener, event + " has no listener")
        let prevented = 0
        const e = {preventDefault: () => prevented++}
        listener(e, "app://-/tx?txHash=abc")
        assert.equal(prevented, 0)
        listener(e, "https://example.com/")
        listener(e, "file:///tmp/page.html")
        assert.equal(prevented, 2)
    }
})

// The load page and the spend prompt are loaded from disk. A file: document
// may navigate to another local file, and a window holding the load preload
// must never end up showing one - nor the wallet page, which would then run
// with the wrong bridge. Nothing those pages do asks to navigate, so every
// request from one is refused, the app origin included.
test("a page loaded from disk may not navigate anywhere, not even to the app origin", () => {
    const contents = fakeContents("file:///app/renderer/out/load/index.html")
    ApplyContentsSecurity(contents)
    for (const event of ["will-navigate", "will-redirect"]) {
        let prevented = 0
        const e = {preventDefault: () => prevented++}
        contents.listeners[event](e, "app://-/wallet")
        contents.listeners[event](e, "file:///app/renderer/out/load/index.html")
        contents.listeners[event](e, "file:///etc/passwd")
        assert.equal(prevented, 3)
    }
})

// A window main has just created has no document yet; a redirect of main's own
// first load is judged as the app page's would be.
test("a window with no document yet is held to the app origin like the app page", () => {
    const contents = fakeContents("")
    ApplyContentsSecurity(contents)
    let prevented = 0
    const e = {preventDefault: () => prevented++}
    contents.listeners["will-redirect"](e, "app://-/wallet")
    assert.equal(prevented, 0)
    contents.listeners["will-redirect"](e, "https://example.com/")
    assert.equal(prevented, 1)
})

// A load window as main would have it: registered, holding the network the
// page chose, forgotten when it closes. Returns what a test needs to see it go.
const loadWindow = (id) => {
    const win = new FakeWindow({})
    win.webContents.id = id
    win.webContents.once("destroyed", () => ForgetWindow(id))
    AddLoadWindow(id)
    SetWindow(id, win)
    SetNetworkOption(id, {Id: "bch", Server: "http://server.test"})
    return win
}
const walletState = () => ({
    filename: "/wallets/trial", wallet: {settings: {}}, integrityKey: "k", encrypted: true,
    session: {envelope: "sealed", spent: 0},
})
const heldBy = (id) => Object.entries(HeldWindowIds())
    .filter(([, ids]) => ids.includes(String(id))).map(([name]) => name)

test("a wallet window opens with the wallet, the network, and the key, and the load window goes", async () => {
    const opener = loadWindow(1)
    built.length = 0
    nextLoad = async (win) => {
        // dom-ready comes before the load resolves, and the key with it.
        win.webContents.emit("dom-ready")
    }
    const winId = await OpenWalletWindow(1, walletState(), "the-key")
    const win = built[0]
    assert.equal(winId, win.webContents.id)
    assert.equal(win.loaded, "app://-/wallet")
    assert.equal(win.options.x, 1, "opens where the load window was")
    assert.deepEqual(GetWallet(winId), walletState())
    assert.deepEqual(GetNetworkOption(winId), {Id: "bch", Server: "http://server.test"})
    assert.deepEqual(win.webContents.sent, [{channel: "session-key", args: ["the-key"]}])
    assert.equal(opener.isDestroyed(), true, "the load window closed")
    assert.equal(GetWindow(1), undefined, "and was forgotten")
    assert.equal(GetWindow(winId), win)
    win.destroy()
    assert.deepEqual(heldBy(winId), [])
})

test("no key is sent for a wallet that opened no session", async () => {
    loadWindow(2)
    built.length = 0
    nextLoad = async (win) => win.webContents.emit("dom-ready")
    const winId = await OpenWalletWindow(2, {...walletState(), session: undefined}, undefined)
    assert.deepEqual(built[0].webContents.sent, [])
    assert.equal(built[0].webContents.listenerCount("dom-ready"), 0)
    built[0].destroy()
    assert.deepEqual(heldBy(winId), [])
})

// The dev server gone between login and here, or anything else that fails
// the first load: the window that never came up is put away with everything
// registered under it, the key is held by nothing, and the load window stays
// open with the error for another try.
test("a wallet window whose load fails is destroyed, its state and key with it, and the load window stays", async () => {
    const opener = loadWindow(3)
    built.length = 0
    nextLoad = async () => {
        throw new Error("ERR_CONNECTION_REFUSED")
    }
    await assert.rejects(OpenWalletWindow(3, walletState(), "the-key"), /ERR_CONNECTION_REFUSED/)
    const win = built[0]
    assert.equal(win.isDestroyed(), true, "the failed window is gone")
    assert.deepEqual(heldBy(win.webContents.id), [], "nothing is held under it")
    assert.equal(win.webContents.listenerCount("dom-ready"), 0, "nothing waits to deliver the key")
    assert.deepEqual(win.webContents.sent, [])
    assert.equal(opener.isDestroyed(), false, "the load window is still there to try again")
    assert.equal(GetWindow(3), opener)
    opener.destroy()
})

// A window closed while its page was still loading has already run its own
// forgetting; the failure it produces must not be mistaken for a window to
// put away again, and the load window still stays.
test("a wallet window destroyed while loading is not destroyed twice, and the load window stays", async () => {
    const opener = loadWindow(4)
    built.length = 0
    let destroys = 0
    nextLoad = async (win) => {
        const destroy = win.destroy.bind(win)
        win.destroy = () => {
            destroys++
            destroy()
        }
        win.destroy()
        throw new Error("Object has been destroyed")
    }
    await assert.rejects(OpenWalletWindow(4, walletState(), "the-key"), /destroyed/)
    assert.equal(destroys, 1)
    assert.deepEqual(heldBy(built[0].webContents.id), [])
    assert.equal(opener.isDestroyed(), false)
    opener.destroy()
})

test("a wallet window is refused when the load window chose no network", async () => {
    const opener = loadWindow(5)
    SetNetworkOption(5, undefined)
    built.length = 0
    await assert.rejects(OpenWalletWindow(5, walletState(), "the-key"), /no network/)
    assert.equal(built.length, 0, "no window was built")
    assert.equal(opener.isDestroyed(), false)
    opener.destroy()
})
