const test = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

// The handlers are driven through the channels they register, the way a
// renderer reaches them, with Electron stubbed and the file real: what is
// under test is that the index server a window runs on is only ever one the
// stored configuration holds, and that the stored configuration only gains a
// server a person allowed in main's own dialog.
const handlers = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
const dialogCalls = []
let dialogResponse = 0
// What happens while the dialog is open, before it is answered: the page in
// another window keeps running, and can save. Runs once, then clears itself,
// so a save it makes that opens a dialog of its own is answered plainly.
let duringDialog = null

stub("electron", {
    app: {isPackaged: true},
    dialog: {
        showMessageBox: async (win, options) => {
            dialogCalls.push({win, options})
            if (duringDialog) {
                const meanwhile = duringDialog
                duringDialog = null
                await meanwhile()
            }
            return {response: dialogResponse}
        },
    },
    ipcMain: {
        handle: (channel, fn) => handlers[channel] = fn,
        on: (channel, fn) => handlers[channel] = fn,
    },
    BrowserWindow: class {},
    nativeTheme: {},
    screen: {},
    shell: {},
})
stub("../../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})

const {Dir, Handlers} = require("../../common/util")
const {DefaultNetworks, ValidateNetworkConfig} = require("../../common/util/network_config")
const {GetNetworkOption, SetWindow} = require("../window_state")
require("./network.js").NetworkHandlers()

// The handlers read and write the one path Dir names, so the tests point it
// at a file of their own before each test and remove the tree at the end.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "network-handler-test-"))
test.after(() => fs.rmSync(tempDir, {recursive: true, force: true}))
let files = 0
test.beforeEach(() => {
    Dir.NetworkConfigFile = path.join(tempDir, "network-" + files + ".json")
    Dir.NetworkApprovedFile = path.join(tempDir, "network-approved-" + (files++) + ".json")
    dialogCalls.length = 0
    dialogResponse = 0
    duringDialog = null
})
const stored = () => JSON.parse(fs.readFileSync(Dir.NetworkConfigFile, "utf8"))
const approvals = () => fs.existsSync(Dir.NetworkApprovedFile)
    ? JSON.parse(fs.readFileSync(Dir.NetworkApprovedFile, "utf8")) : undefined

const e = (id) => ({sender: {id}, senderFrame: {url: "app://-/"}})
const get = () => handlers[Handlers.GetNetworkConfig](e(1))
const save = (id, config) => handlers[Handlers.SaveNetworkConfig](e(id), config)
const select = (id, networkId) => handlers[Handlers.SelectNetwork](e(id), networkId)
const windowNetwork = (id) => handlers[Handlers.GetWindowNetwork](e(id))

const presets = () => ({Networks: DefaultNetworks.map((option) => ({...option}))})
const withServer = (config, id, Server) => ({
    ...config,
    Networks: config.Networks.map((option) => option.Id === id ? {...option, Server} : option),
})

// With no file, or a file that does not validate, main answers with the
// presets - the renderer used to carry its own copy for this case, which
// meant two lists that could drift apart, one of them on the wrong side.
test("the configuration is the stored file, or the presets when there is none to read", async () => {
    assert.deepEqual(await get(), {Networks: DefaultNetworks})
    fs.writeFileSync(Dir.NetworkConfigFile, "{not json")
    assert.deepEqual(await get(), {Networks: DefaultNetworks})
    const custom = withServer(presets(), "bch", "https://index.example")
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(custom))
    assert.deepEqual(await get(), custom)
})

// The presets, anything on this machine, and a remembered default go straight
// to the file: these are the routine edits, and a gate on them would be
// friction the threat does not need.
test("presets, loopback servers, and the remembered default are saved without asking", async () => {
    await save(1, {...presets(), Last: 2})
    assert.equal(dialogCalls.length, 0)
    assert.equal(stored().Last, 2)
    const flipped = presets()
    flipped.Networks[2].Ruleset = "bsv"
    await save(1, withServer(flipped, "dev", "http://localhost:9000"))
    assert.equal(dialogCalls.length, 0)
    assert.equal(stored().Networks[2].Server, "http://localhost:9000")
    assert.equal(stored().Networks[2].Ruleset, "bsv")
    await save(1, withServer(presets(), "bch", "http://[::1]:26770"))
    assert.equal(dialogCalls.length, 0)
    assert.equal(stored().Networks[0].Server, "http://[::1]:26770")
})

// The vector: a page pointing the wallet at a server of its own choosing,
// which then answers every token question the signer will trust. Such a
// server is named in a dialog main draws, modal to the asking window, and a
// declined dialog leaves the file exactly as it was.
test("a server nobody vouched for is asked in main's dialog, naming it, or is not saved", async () => {
    SetWindow(5, {id: 5})
    const hostile = withServer(presets(), "bch", "https://index.example")
    await assert.rejects(save(5, hostile), /not allowed/)
    assert.equal(dialogCalls.length, 1)
    assert.equal(dialogCalls[0].win.id, 5)
    assert.equal(dialogCalls[0].options.buttons[dialogCalls[0].options.cancelId], "Cancel")
    assert.match(dialogCalls[0].options.detail, /https:\/\/index\.example/)
    assert.match(dialogCalls[0].options.detail, /cancel/)
    assert.ok(!fs.existsSync(Dir.NetworkConfigFile))

    dialogResponse = 1
    await save(5, hostile)
    assert.equal(dialogCalls.length, 2)
    assert.equal(stored().Networks[0].Server, "https://index.example")
})

// A server a person allowed here is on record as approved; re-asking on
// every later edit would teach the person to click through the dialog. A
// change elsewhere in the list, or a new server alongside, asks only about
// what is new - and each new one is named.
test("an approved server is not asked about again, only what is new is", async () => {
    dialogResponse = 1
    await save(1, withServer(presets(), "bch", "https://index.example"))
    assert.equal(dialogCalls.length, 1)
    // The same custom server, Last changed: nothing new.
    await save(1, {...withServer(presets(), "bch", "https://index.example"), Last: 1})
    assert.equal(dialogCalls.length, 1)
    assert.equal(stored().Last, 1)
    // Two more servers, one of them twice: the dialog names each once.
    const more = withServer(withServer(withServer(presets(), "bch", "https://index.example"),
        "bsv", "https://one.example"), "dev", "https://one.example")
    more.Networks.push({...more.Networks[0], Id: "two", Name: "Two", Server: "https://two.example"})
    await save(1, more)
    assert.equal(dialogCalls.length, 2)
    const named = dialogCalls[1].options.detail.split("\n").filter((line) => line.startsWith("https://"))
    assert.deepEqual(named, ["https://one.example", "https://two.example"])
    assert.equal(stored().Networks.length, 4)
})

// A configuration the validator refuses never reaches the dialog or the
// file: the gate is for servers that pass the shape rules, not a second
// place to report the ones that do not.
test("an invalid configuration is refused before anything is asked or written", async () => {
    await assert.rejects(save(1, withServer(presets(), "bch", "http://index.example")), /https/)
    await assert.rejects(save(1, {Networks: []}), /Invalid/)
    assert.equal(dialogCalls.length, 0)
    assert.ok(!fs.existsSync(Dir.NetworkConfigFile))
})

// The other half of the vector: a window used to be set onto whatever
// option object the page sent, saved list or not. Now it names an entry and
// runs on what the file holds for it - and only an entry the file holds.
test("a window runs on the stored entry its id names, and that becomes the default", async () => {
    dialogResponse = 1
    await save(1, withServer(presets(), "bch", "https://index.example"))
    dialogCalls.length = 0
    const selected = await select(7, "bch")
    assert.equal(selected.Server, "https://index.example")
    assert.deepEqual(GetNetworkOption(7), stored().Networks[0])
    assert.deepEqual(await windowNetwork(7), stored().Networks[0])
    assert.equal(stored().Last, 0)
    await select(8, "dev")
    assert.equal(GetNetworkOption(8).Server, "http://127.0.0.1:26770")
    assert.equal(stored().Last, 2)
    // The first window's choice is untouched by the second's.
    assert.equal(GetNetworkOption(7).Server, "https://index.example")
    assert.equal(dialogCalls.length, 0)
})

// An id that names nothing, and an option object where an id should be, are
// both refused with no window state changed: there is no server for main to
// take from either.
test("a selection the configuration does not hold is refused, an object doubly so", async () => {
    await assert.rejects(select(9, "gone"), /no configured network/)
    await assert.rejects(select(9, undefined), /no configured network/)
    await assert.rejects(select(9, {...DefaultNetworks[0], Server: "https://index.example"}),
        /no configured network/)
    assert.equal(GetNetworkOption(9), undefined)
    assert.equal(await windowNetwork(9), undefined)
    assert.ok(!fs.existsSync(Dir.NetworkConfigFile))
})

// With no file yet, selecting still works - on the presets - and writes the
// choice down, so the load screen's default survives the first run.
test("selecting on a fresh install runs on a preset and writes the file", async () => {
    await select(10, "bsv")
    assert.deepEqual(GetNetworkOption(10), DefaultNetworks[1])
    assert.deepEqual(stored(), {Networks: DefaultNetworks, Last: 1})
})

// The review's case: a file written by an older version, where the page
// saved with nobody asked. Its custom server is present but nowhere on
// record as approved, so the first selection of that entry is asked in the
// dialog - a declined one leaves the window and the file exactly as they
// were - and an allowed one is written down, so the next selection is not.
test("a custom server from a file written before main owned it is asked about on first selection", async () => {
    const legacy = withServer(presets(), "bch", "https://index.example")
    const written = JSON.stringify(legacy, null, 2) + "\n"
    fs.writeFileSync(Dir.NetworkConfigFile, written)
    SetWindow(30, {id: 30})
    await assert.rejects(select(30, "bch"), /not allowed/)
    assert.equal(dialogCalls.length, 1)
    assert.equal(dialogCalls[0].win.id, 30)
    assert.match(dialogCalls[0].options.detail, /https:\/\/index\.example/)
    assert.match(dialogCalls[0].options.detail, /choose this network, cancel/)
    assert.equal(GetNetworkOption(30), undefined)
    assert.equal(fs.readFileSync(Dir.NetworkConfigFile, "utf8"), written)
    // The presets in the same file stay frictionless.
    await select(30, "dev")
    assert.equal(dialogCalls.length, 1)
    assert.equal(GetNetworkOption(30).Id, "dev")

    dialogResponse = 1
    const selected = await select(30, "bch")
    assert.equal(dialogCalls.length, 2)
    assert.equal(selected.Server, "https://index.example")
    assert.equal(GetNetworkOption(30).Server, "https://index.example")
    assert.deepEqual(approvals(), ["https://index.example"])
    assert.equal(stored().Last, 0)
    dialogResponse = 0
    await select(31, "bch")
    assert.equal(dialogCalls.length, 2)
    assert.equal(GetNetworkOption(31).Server, "https://index.example")
})

// The same legacy server met by a save instead: an edit elsewhere in the
// list still names it, since keeping it is as much a choice as adding it.
test("a save that keeps an unapproved legacy server is asked about it", async () => {
    fs.writeFileSync(Dir.NetworkConfigFile,
        JSON.stringify(withServer(presets(), "bch", "https://index.example")))
    const edit = withServer(withServer(presets(), "bch", "https://index.example"), "dev", "http://localhost:1")
    await assert.rejects(save(1, edit), /not allowed/)
    assert.match(dialogCalls[0].options.detail, /https:\/\/index\.example/)
    assert.match(dialogCalls[0].options.detail, /edit the network configuration, cancel/)
    assert.equal(stored().Networks[2].Server, "http://127.0.0.1:26770")
    dialogResponse = 1
    await save(1, edit)
    assert.deepEqual(approvals(), ["https://index.example"])
    assert.equal(stored().Networks[2].Server, "http://localhost:1")
})

// Approval is main's record alone: a request that carries a list of its own
// is not the shape the page may send, and the page never reads one back.
test("the page can neither send an approval list nor read one", async () => {
    await assert.rejects(save(1, {...presets(), Approved: ["https://index.example"]}), /Invalid network configuration/)
    assert.equal(dialogCalls.length, 0)
    assert.ok(!fs.existsSync(Dir.NetworkConfigFile))
    dialogResponse = 1
    await save(1, withServer(presets(), "bch", "https://index.example"))
    assert.deepEqual(approvals(), ["https://index.example"])
    assert.deepEqual(await get(), withServer(presets(), "bch", "https://index.example"))
})

// An approval lives as long as the server is on the list. Removing it and
// putting it back later asks again, and a malformed record reads as none.
test("an approval is dropped with its server, and a malformed record counts for nothing", async () => {
    dialogResponse = 1
    const custom = withServer(presets(), "bch", "https://index.example")
    await save(1, custom)
    assert.equal(dialogCalls.length, 1)
    await save(1, presets())
    assert.equal(dialogCalls.length, 1)
    assert.deepEqual(approvals(), [])
    await save(1, custom)
    assert.equal(dialogCalls.length, 2)
    fs.writeFileSync(Dir.NetworkApprovedFile, JSON.stringify("https://index.example"))
    await save(1, custom)
    assert.equal(dialogCalls.length, 3)
    fs.writeFileSync(Dir.NetworkApprovedFile, "{not json")
    await save(1, custom)
    assert.equal(dialogCalls.length, 4)
    fs.writeFileSync(Dir.NetworkApprovedFile, JSON.stringify([1, "https://index.example"]))
    await save(1, custom)
    assert.equal(dialogCalls.length, 4)
    assert.deepEqual(approvals(), ["https://index.example"])
})

// The record lives beside network.json, not in it. The previous release
// reads network.json through the same exact-key validator this module
// still exports, and a key it did not know would have it discard the
// person's networks for the presets - and, on the next wallet load, write
// the presets back over them. So the file an approval leaves behind must
// read under that validator as exactly the configuration, and the old
// load flow's own rewrite of it (Last, presets untouched) must leave the
// approval standing.
test("an approval leaves network.json readable by the previous release, and survives its rewrite", async () => {
    dialogResponse = 1
    const custom = withServer(presets(), "bch", "https://index.example")
    await save(1, custom)
    const written = JSON.parse(fs.readFileSync(Dir.NetworkConfigFile, "utf8"))
    assert.deepEqual(Object.keys(written).sort(), ["Networks"])
    assert.deepEqual(ValidateNetworkConfig(written), custom)
    // The old load flow: read, set Last, save the whole thing back.
    const previous = ValidateNetworkConfig(written)
    previous.Last = 0
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(previous, null, 2) + "\n")
    dialogResponse = 0
    dialogCalls.length = 0
    await select(40, "bch")
    assert.equal(dialogCalls.length, 0)
    assert.equal(GetNetworkOption(40).Server, "https://index.example")
    assert.deepEqual(stored(), {...custom, Last: 0})
    assert.deepEqual(approvals(), ["https://index.example"])
})

// The record can outlive the list it vouched for: the previous release
// rewrites network.json alone - here its editor swaps the custom server for
// another - and knows nothing of the record beside it. What the record says
// counts only for servers on the list as it stands, so the server it still
// names is asked about again when it comes back, by save or by selection.
test("an approval for a server the previous release removed from the list does not vouch for its return", async () => {
    dialogResponse = 1
    const custom = withServer(presets(), "bch", "https://index.example")
    await save(1, custom)
    assert.deepEqual(approvals(), ["https://index.example"])
    // The old editor pointed the BCH entry elsewhere and saved.
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(withServer(presets(), "bch", "https://other.example")))
    dialogResponse = 0
    dialogCalls.length = 0
    await assert.rejects(save(1, custom), /not allowed/)
    assert.equal(dialogCalls.length, 1)
    assert.match(dialogCalls[0].options.detail, /https:\/\/index\.example/)
    assert.deepEqual(approvals(), ["https://index.example"])
    // The stale record is pruned by the next write that goes through.
    await save(1, presets())
    assert.equal(dialogCalls.length, 1)
    assert.deepEqual(approvals(), [])
})

// The same stale record made by this version: a save that removes the
// approved server lands network.json and then fails to write the record.
// The handler rejects, the removal stands, the record still names the
// server - and re-adding it is asked about all the same.
test("a record left stale by a failed write does not vouch for a re-added server", async () => {
    dialogResponse = 1
    const custom = withServer(presets(), "bch", "https://index.example")
    await save(1, custom)
    assert.equal(dialogCalls.length, 1)
    // The handler reads the record's path once to read it and once to
    // write it; the second access is sent to a directory, which no file
    // write can land on.
    const record = Dir.NetworkApprovedFile
    const blocked = path.join(tempDir, "blocked-" + files)
    fs.mkdirSync(blocked)
    let accesses = 0
    Object.defineProperty(Dir, "NetworkApprovedFile",
        {configurable: true, get: () => ++accesses === 2 ? blocked : record})
    try {
        await assert.rejects(save(1, presets()))
    } finally {
        Object.defineProperty(Dir, "NetworkApprovedFile",
            {configurable: true, enumerable: true, writable: true, value: record})
    }
    assert.equal(accesses, 2)
    assert.deepEqual(stored(), presets())
    assert.deepEqual(approvals(), ["https://index.example"])
    dialogResponse = 0
    await assert.rejects(save(1, custom), /not allowed/)
    assert.equal(dialogCalls.length, 2)
    assert.match(dialogCalls[1].options.detail, /https:\/\/index\.example/)
    assert.deepEqual(stored(), presets())
    dialogResponse = 1
    await save(1, custom)
    assert.deepEqual(approvals(), ["https://index.example"])
})

// A selection changes Last, but writes the whole file. While its dialog
// waits on a person, another load window can save an edit - here pointing
// the Dev entry at a local port, and approving a new BSV server in a dialog
// of its own. Writing back what was read before the dialog would revert the
// edit and drop that approval; the selection must land on the file as it
// stands, and the dialog's own approval beside the other window's.
test("a selection answered after another window saved lands on that save, not on what it read", async () => {
    const legacy = withServer(presets(), "bch", "https://index.example")
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(legacy))
    SetWindow(50, {id: 50})
    dialogResponse = 1
    const edit = withServer(withServer(legacy, "dev", "http://localhost:1"), "bsv", "https://one.example")
    duringDialog = async () => {
        await save(1, edit)
        assert.deepEqual(approvals(), ["https://index.example", "https://one.example"])
    }
    const selected = await select(50, "bch")
    assert.equal(selected.Server, "https://index.example")
    assert.equal(GetNetworkOption(50).Server, "https://index.example")
    // The outer dialog named the server being selected; the inner one, run
    // by the other window's save, named both of that save's new servers.
    assert.equal(dialogCalls.length, 2)
    assert.match(dialogCalls[0].options.detail, /choose this network/)
    assert.match(dialogCalls[1].options.detail, /edit the network configuration/)
    assert.deepEqual(stored(), {...edit, Last: 0})
    assert.deepEqual(approvals(), ["https://index.example", "https://one.example"])
})

// The dialog vouched for one server by name. If, while it was open, the
// entry it was asked about came to point elsewhere - the other window's
// editor moved it - the answer is not for the server now on the list. The
// selection is refused, the window stays off the network, and the other
// window's file stands untouched, its own approval included.
test("a selection whose entry changed under the dialog is refused, and the newer file stands", async () => {
    const legacy = withServer(presets(), "bch", "https://index.example")
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(legacy))
    SetWindow(51, {id: 51})
    dialogResponse = 1
    const moved = withServer(presets(), "bch", "https://other.example")
    duringDialog = () => save(1, moved)
    await assert.rejects(select(51, "bch"), /changed while the dialog was open/)
    assert.equal(GetNetworkOption(51), undefined)
    assert.deepEqual(stored(), moved)
    assert.deepEqual(approvals(), ["https://other.example"])
    // Removed outright, the same: nothing to select and nothing written.
    fs.writeFileSync(Dir.NetworkConfigFile, JSON.stringify(legacy))
    const without = presets()
    without.Networks.splice(0, 1)
    duringDialog = () => save(1, without)
    await assert.rejects(select(51, "bch"), /changed while the dialog was open/)
    assert.equal(GetNetworkOption(51), undefined)
    assert.deepEqual(stored(), without)
    assert.deepEqual(approvals(), [])
    // With the dialog behind it, the selection that is asked again goes through.
    await select(51, "bsv")
    assert.equal(GetNetworkOption(51).Id, "bsv")
})
