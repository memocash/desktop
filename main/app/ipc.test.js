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

const {AppUrl, GuardedIpc, ipcMain} = require("./ipc")

const event = (url) => url === undefined ? {sender: {id: 1}} : {sender: {id: 1}, senderFrame: {url}}

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
    const prompt = GuardedIpc((url) => url === promptUrl)
    let ran = 0
    prompt.on("guard_prompt", () => ran++)
    registered["guard_prompt"](event(promptUrl))
    assert.equal(ran, 1)
    for (const url of ["file:///app/main/assets/other.html", "app://-/wallet", undefined]) {
        registered["guard_prompt"](event(url))
    }
    assert.equal(ran, 1)
})
