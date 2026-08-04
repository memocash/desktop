const test = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

// The handlers are driven through the channels they register, the way a
// renderer reaches them, with only Electron itself and the modules that touch a
// database stubbed out. The keystore, the wallet file, the session sealing and
// the window state are all the real ones - what is under test is the boundary
// they form together: that no settings write on an encrypted wallet ever skips
// the password proof, and that a policy written in one window governs every
// window open on the same file.
const handlers = {}
const stub = (request, exports) => {
    const filename = require.resolve(request)
    require.cache[filename] = {id: filename, filename, loaded: true, exports}
}
stub("electron", {
    app: {isPackaged: true},
    ipcMain: {
        handle: (channel, fn) => handlers[channel] = fn,
        on: (channel, fn) => handlers[channel] = fn,
    },
    BrowserWindow: class {},
    nativeTheme: {},
    screen: {},
    shell: {},
})
stub("../../data/tables", {GetOutput: async () => undefined, GetWalletInfo: async () => ({})})
stub("../../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})

const keystore = require("../keystore")
const {GetWallet, SetWindow, ForgetWindow} = require("../window_state")
const {Handlers} = require("../../common/util")
require("./wallet.js").WalletHandlers()

const e = (id) => ({sender: {id}})
const unlock = (id, walletPath) => handlers[Handlers.UnlockWallet](e(id), walletPath, "pw")
const change = (id, threshold, password) => handlers[Handlers.UpdateWallet](
    e(id), "changeSettings", {PasswordThreshold: threshold}, password)

// The scenario that shipped the bypass: two windows on one encrypted wallet,
// where a write claimed against one window's cached copy of the policy went to
// the file. The gate must ask for the password without comparing the request
// against any cache - a request for exactly the value a window already holds is
// the one the original comparison waved through.
test("a settings change on an encrypted wallet always proves the password, in every window", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-handler-test-"))
    const walletPath = path.join(dir, "two_windows")
    try {
        await keystore.CreateWalletFile(walletPath,
            keystore.NewWallet(undefined, [], ["1BoatSLRHtKNngkdXEeobR76b53LETtpyT"]), "pw")
        const diskThreshold = async () =>
            ((await keystore.ReadWallet(walletPath, "pw")).wallet.settings || {}).PasswordThreshold || 0
        for (const id of [1, 2]) {
            SetWindow(id, {id})
            keystore.AllowPath(id, walletPath)
            assert.equal((await unlock(id, walletPath)).ok, true)
        }

        // No password, asking for the value already on disk and in this
        // window's cache - a no-op by value, still a refusal by rule.
        assert.deepEqual(await change(2, 0, undefined), {error: keystore.WrongPassword})

        // The proof opens a budget for the window that made it, and the new
        // policy reaches the sibling's cache - not just the writer's children.
        const raised = await change(1, 1000000, "pw")
        assert.equal(raised.ok, true)
        assert.notEqual(raised.sessionKey, undefined)
        assert.notEqual(GetWallet(1).session, undefined)
        assert.equal(GetWallet(2).wallet.settings.PasswordThreshold, 1000000)
        assert.equal(GetWallet(2).session, undefined)

        // A settings change ends every session on the file, however unchanged
        // the values: each was sealed against the policy being replaced. Only
        // the window that proved the password gets a fresh one.
        const rewritten = await change(2, 1000000, "pw")
        assert.equal(rewritten.ok, true)
        assert.notEqual(rewritten.sessionKey, undefined)
        assert.notEqual(GetWallet(2).session, undefined)
        assert.equal(GetWallet(1).session, undefined, "the sibling's old session must not survive")

        // The reproduced attack: request the exact threshold this window has
        // cached, with no password. The original gate compared and skipped the
        // proof; the file must stay as it is.
        assert.deepEqual(await change(2, 1000000, undefined), {error: keystore.WrongPassword})
        assert.equal(await diskThreshold(), 1000000)

        // Revoking in one window revokes everywhere: the sibling's cache reads
        // the new policy and its session is gone with the budget. A threshold
        // of zero opens no session for the writer either.
        const revoked = await change(1, 0, "pw")
        assert.equal(revoked.ok, true)
        assert.equal(revoked.sessionKey, undefined)
        assert.equal(GetWallet(2).wallet.settings.PasswordThreshold, 0)
        assert.equal(GetWallet(2).session, undefined)
        assert.equal(await diskThreshold(), 0)

        // And the revoked budget cannot be written back without the password.
        assert.deepEqual(await change(2, 1000000, undefined), {error: keystore.WrongPassword})
        assert.equal(await diskThreshold(), 0)
    } finally {
        ForgetWindow(1)
        ForgetWindow(2)
        keystore.ForgetPaths(1)
        keystore.ForgetPaths(2)
        fs.rmSync(dir, {recursive: true, force: true})
    }
})
