const test = require("node:test")
const assert = require("node:assert")

// The preload runs against a scripted ipcRenderer, so what is under test is the
// contract it keeps with main: the session key never crosses back to the page,
// and PasswordRequired always means "relay to the parent" - including when this
// preload still holds a key, which is exactly the stale-key state that used to
// dead-end a preview window instead of relaying.
const invoked = []
const respond = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    ipcRenderer: {
        invoke: async (channel, ...args) => {
            invoked.push(channel)
            return respond[channel](...args)
        },
        on: () => {},
        send: () => {},
    },
})

const {Handlers} = require("../common/util/handlers")
const {WalletErrors} = require("../common/util/errors")
const preload = require("./wallet.js")

test("a spend refused as password-required is relayed even while a session key is held", async () => {
    respond[Handlers.UnlockWallet] = async () => ({ok: true, sessionKey: "stale-key"})
    const unlocked = await preload.unlockWallet("wallet", "pw")
    // The key stays on this side of the bridge.
    assert.equal(unlocked.sessionKey, undefined)
    assert.deepEqual(unlocked, {ok: true})

    let offeredKey
    respond[Handlers.SignTransaction] = async (request, sessionKey) => {
        offeredKey = sessionKey
        return {error: WalletErrors.PasswordRequired}
    }
    respond[Handlers.SignOnParentSession] = async () =>
        ({ok: true, value: {txid: "relayed"}, sessionKey: "renewed"})
    invoked.length = 0
    const result = await preload.signTransaction({raw: "00"})
    // The key was offered, main said only the parent could answer, and holding
    // the key was no reason not to go there. The relayed reply comes back with
    // its own key kept on this side.
    assert.equal(offeredKey, "stale-key")
    assert.deepEqual(invoked, [Handlers.SignTransaction, Handlers.SignOnParentSession])
    assert.deepEqual(result, {ok: true, value: {txid: "relayed"}})

    // The key the relay renewed is the one offered next time.
    respond[Handlers.SignTransaction] = async (request, sessionKey) => {
        offeredKey = sessionKey
        return {ok: true, value: {txid: "direct"}}
    }
    invoked.length = 0
    assert.deepEqual(await preload.signTransaction({raw: "00"}), {ok: true, value: {txid: "direct"}})
    assert.equal(offeredKey, "renewed")
    assert.deepEqual(invoked, [Handlers.SignTransaction])
})

test("an answer other than password-required comes back without relaying", async () => {
    for (const answer of [{error: WalletErrors.SpendCancelled}, {error: "watch-only-wallet"}]) {
        respond[Handlers.SignTransaction] = async () => answer
        invoked.length = 0
        assert.deepEqual(await preload.signTransaction({raw: "00"}), answer)
        assert.deepEqual(invoked, [Handlers.SignTransaction])
    }
})
