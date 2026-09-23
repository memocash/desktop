const test = require("node:test")
const assert = require("node:assert")

// The guarded surface is the layer that holds if the origin lock on windows
// ever regresses: a handler registered through it must never run for a sender
// frame off the expected origin, however the frame got there. Electron is
// stubbed the way wallet.test.js stubs it, with registration captured so the
// wrapped handlers can be driven directly.
const registered = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: (channel, fn) => registered[channel] = fn,
        on: (channel, fn) => registered[channel] = fn,
    },
})

const {AddLoadWindow, ForgetWindow} = require("./window_state")
const {AppUrl, GuardedIpc, ipcMain, loadIpc, sharedIpc} = require("./ipc")

// A message from a window's main frame, the way every legitimate one arrives.
const event = (url, id = 1) => {
    if (url === undefined) {
        return {sender: {id}}
    }
    const frame = {url}
    return {sender: {id, mainFrame: frame}, senderFrame: frame}
}
// The same document in a subframe: a page framed the url, and the message
// comes from the frame rather than from the window's own page.
const framed = (url, id = 1) => ({sender: {id, mainFrame: {url: "app://-/wallet"}}, senderFrame: {url}})

test("a packaged build's app origin is the app protocol", () => {
    assert.equal(AppUrl, "app://-")
})

test("an invoke from the app's own page reaches the handler", async () => {
    let saw = null
    ipcMain.handle("guard_pass", (e, value) => {
        saw = value
        return "answered"
    })
    assert.equal(await registered["guard_pass"](event("app://-/wallet"), 7), "answered")
    assert.equal(saw, 7)
})

test("an invoke from a foreign origin is refused before the handler runs", () => {
    let ran = 0
    ipcMain.handle("guard_foreign", () => ran++)
    for (const url of ["https://example.com/", "file:///tmp/evil.html", "app://other/"]) {
        assert.throws(() => registered["guard_foreign"](event(url)))
    }
    assert.equal(ran, 0)
})

test("an invoke with no sender frame is refused", () => {
    let ran = 0
    ipcMain.handle("guard_no_frame", () => ran++)
    assert.throws(() => registered["guard_no_frame"](event(undefined)))
    assert.equal(ran, 0)
})

test("a send from a foreign origin is dropped without throwing", () => {
    let ran = 0
    ipcMain.on("guard_send", () => ran++)
    // A throw from an on listener would itself crash main, so the refusal has
    // to be a silent drop here - and still let the app's own page through.
    assert.doesNotThrow(() => registered["guard_send"](event("https://example.com/")))
    assert.equal(ran, 0)
    registered["guard_send"](event("app://-/"))
    assert.equal(ran, 1)
})

test("a custom matcher admits exactly its page, the way the spend prompt uses one", () => {
    const promptUrl = "file:///app/main/assets/spend_prompt.html"
    const prompt = GuardedIpc((e) => e.senderFrame.url === promptUrl)
    let ran = 0
    prompt.on("guard_prompt", () => ran++)
    registered["guard_prompt"](event(promptUrl))
    assert.equal(ran, 1)
    for (const url of ["file:///app/main/assets/other.html", "app://-/wallet", undefined]) {
        registered["guard_prompt"](event(url))
    }
    assert.equal(ran, 1)
})

// A page can frame a document from its own origin and script it; the frame's
// url is then a legitimate one, and a guard that looked only at the url would
// take the framed copy for the page. Every surface admits main frames only,
// whatever its rule says about the url.
test("a message from a subframe is refused on every surface, however legitimate its url", () => {
    AddLoadWindow(3)
    let ran = 0
    ipcMain.handle("guard_sub_app", () => ran++)
    sharedIpc.handle("guard_sub_shared", () => ran++)
    loadIpc.handle("guard_sub_load", () => ran++)
    assert.throws(() => registered["guard_sub_app"](framed("app://-/wallet")))
    assert.throws(() => registered["guard_sub_shared"](framed("app://-/wallet")))
    assert.throws(() => registered["guard_sub_load"](framed("file:///app/renderer/out/load/index.html", 3)))
    assert.equal(ran, 0)
    ForgetWindow(3)
})

// The load surface is judged by the window, not the url: main registered the
// window when it opened it on the load page, and nothing about what a frame
// says of itself can stand in for that. A wallet page is refused whatever it
// presents; a load window is admitted whatever its file url looks like after
// Chromium has normalised it; a window that closed is refused from then on.
test("the load surface admits the windows main opened on the load page and nothing else", async () => {
    const loadUrl = "file:///Applications/Memo.app/Contents/Resources/app.asar/renderer/out/load/index.html"
    let ran = 0
    loadIpc.handle("guard_load", () => ++ran)
    assert.throws(() => registered["guard_load"](event(loadUrl, 5)), "not a window main opened")
    AddLoadWindow(5)
    assert.equal(await registered["guard_load"](event(loadUrl, 5)), 1)
    assert.equal(await registered["guard_load"](event("file:///C:/odd%20path/load/index.html", 5)), 2)
    assert.throws(() => registered["guard_load"](event("app://-/wallet", 1)), "the wallet page")
    assert.throws(() => registered["guard_load"](event("app://-/wallet", 5)),
        "the load window's id presented by a page that is not on it")
    ForgetWindow(5)
    assert.throws(() => registered["guard_load"](event(loadUrl, 5)), "a closed load window")
    assert.equal(ran, 2)
})

test("the app surface refuses a load window; the shared surface admits both", async () => {
    AddLoadWindow(6)
    const loadUrl = "file:///app/renderer/out/load/index.html"
    let ran = 0
    ipcMain.handle("guard_app_only", () => ++ran)
    sharedIpc.handle("guard_shared", () => ++ran)
    assert.throws(() => registered["guard_app_only"](event(loadUrl, 6)))
    assert.equal(await registered["guard_shared"](event(loadUrl, 6)), 1)
    assert.equal(await registered["guard_shared"](event("app://-/wallet", 1)), 2)
    assert.throws(() => registered["guard_shared"](event("https://example.com/", 1)))
    ForgetWindow(6)
})
