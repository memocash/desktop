const test = require("node:test")
const assert = require("node:assert")
const {EventEmitter} = require("node:events")
const {Handlers} = require("../common/util")

// The reply channel is where a spend's password crosses from a page into
// main. It admits the prompt windows main opened, by the id main registered
// as it opened each, and nothing else: not another window presenting the
// prompt's own url, not the prompt's id from a frame off the file, and not
// a prompt already closed. Electron is stubbed the way ipc.test.js stubs it,
// with a BrowserWindow stand-in whose page is driven from the test.
const registered = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
let nextId = 50
const built = []
class FakeWindow extends EventEmitter {
    constructor(options) {
        super()
        this.options = options
        this.destroyed = false
        this.webContents = {id: ++nextId, steps: [], send: (_channel, step) => this.webContents.steps.push(step)}
        built.push(this)
    }
    async loadFile(file) {
        this.loaded = file
    }
    show() {
        this.shown = true
    }
    isDestroyed() {
        return this.destroyed
    }
    destroy() {
        if (!this.destroyed) {
            this.destroyed = true
            this.emit("closed")
        }
    }
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: (channel, fn) => registered[channel] = fn,
        on: (channel, fn) => registered[channel] = fn,
    },
    BrowserWindow: FakeWindow,
})
stub("./window", {BackgroundColor: () => "#000000"})

const {OpenSpendPrompt, SpendPromptHandlers} = require("./spend_prompt")
SpendPromptHandlers()
const reply = registered[Handlers.SpendPromptReply]

const PromptUrl = "file:///app/main/assets/spend_prompt.html"
// A reply from a window's main frame, the way the prompt's preload sends one.
const from = (id, url = PromptUrl) => {
    const frame = {url}
    return {sender: {id, mainFrame: frame}, senderFrame: frame}
}
const settled = () => new Promise((resolve) => setImmediate(resolve))
// What the guard logged while fn ran: a refusal names the channel.
const refusals = async (fn) => {
    const lines = []
    const log = console.log
    console.log = (line) => lines.push(line)
    try {
        await fn()
    } finally {
        console.log = log
    }
    return lines.filter((line) => line.startsWith("ipc: refused"))
}
// The prompt shows only once its page has said it is ready, which is the
// first reply over the channel.
const open = async () => {
    const opening = OpenSpendPrompt({})
    await settled()
    const win = built[built.length - 1]
    reply(from(win.webContents.id), {})
    const prompt = await opening
    assert.equal(win.shown, true)
    return {win, prompt}
}

test("a reply is admitted from the prompt window main opened and from nothing else", async () => {
    const {win, prompt} = await open()
    const id = win.webContents.id
    let answered = null
    const asked = prompt.askPassword({payments: [], fee: 0}).then((password) => answered = password)
    const refused = await refusals(async () => {
        // A window main never opened, showing the prompt's own url.
        reply(from(id + 1000), {password: "stolen"})
        // The prompt's id, from a frame that is not the prompt page.
        reply(from(id, "app://-/wallet"), {password: "stolen"})
        // The prompt page in a subframe of the prompt window.
        reply({sender: {id, mainFrame: {url: PromptUrl}}, senderFrame: {url: PromptUrl}}, {password: "stolen"})
        await settled()
    })
    assert.equal(refused.length, 3)
    assert.equal(answered, null, "nothing answered for the prompt")
    reply(from(id), {password: "pw"})
    await asked
    assert.equal(answered, "pw")
    prompt.close()
    assert.equal(win.isDestroyed(), true)
})

test("a closed prompt's id admits nothing", async () => {
    const {win, prompt} = await open()
    prompt.close()
    const refused = await refusals(() => reply(from(win.webContents.id), {password: "late"}))
    assert.equal(refused.length, 1)
})
