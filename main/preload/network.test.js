const test = require("node:test")
const assert = require("node:assert")

// The network functions run against a scripted ipcRenderer; what is under test
// is the shape of what the load page gets back from them.
const respond = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    ipcRenderer: {
        invoke: async (channel, ...args) => respond[channel](...args),
        on: () => {},
        send: () => {},
    },
})

const {Handlers} = require("../common/util/handlers")
const preload = require("./network.js")

// The network editor and the load screen show a handler's refusal to the
// person - a rejected server, a declined dialog - and Electron's channel
// prefix on the rejection is not part of that reason. Success is untouched.
test("network calls reject with the handler's reason alone", async () => {
    const wrapped = (message) => new Error(
        "Error invoking remote method 'save-network-config': Error: " + message)
    respond[Handlers.SaveNetworkConfig] = async () => { throw wrapped("not allowed in the confirmation dialog") }
    await assert.rejects(preload.saveNetworkConfig({}), {message: "not allowed in the confirmation dialog"})
    respond[Handlers.SaveNetworkConfig] = async () => { throw new Error(
        "Error invoking remote method 'save-network-config': TypeError: Invalid network server") }
    await assert.rejects(preload.saveNetworkConfig({}), {message: "Invalid network server"})
    respond[Handlers.SelectNetwork] = async () => { throw new Error("no configured network matches the selection") }
    await assert.rejects(preload.selectNetwork("gone"), {message: "no configured network matches the selection"})
    respond[Handlers.SelectNetwork] = async (id) => ({Id: id})
    assert.deepEqual(await preload.selectNetwork("bch"), {Id: "bch"})
})
