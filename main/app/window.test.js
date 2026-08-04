const test = require("node:test")
const assert = require("node:assert")

// ApplyContentsSecurity is what stands between a page that can read the wallet
// and a page from anywhere else: window opens always denied and routed to the
// browser, navigation held to the app origin. It is wired to every WebContents
// through main/index.js's web-contents-created hook; here the function is
// driven directly against a recording stand-in for a WebContents.
const opened = []
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: () => undefined,
        on: () => undefined,
    },
    BrowserWindow: class {},
    nativeTheme: {},
    screen: {},
    shell: {openExternal: (url) => opened.push(url)},
})
stub("../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})

const {ApplyContentsSecurity} = require("./window")

const fakeContents = () => {
    const contents = {listeners: {}}
    contents.setWindowOpenHandler = (fn) => contents.openHandler = fn
    contents.on = (event, fn) => contents.listeners[event] = fn
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
