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
// Main's own surfaces, controllable per test: the native dialog that gates a
// passwordless wallet's settings, the spend prompt that approves its sends, and
// the prevout store the signer reads amounts from.
const dialogCalls = []
let dialogResponse = 0
const approveCalls = []
let approveResponse = true
let getOutput = async () => undefined

stub("electron", {
    app: {isPackaged: true},
    dialog: {
        showMessageBox: async (win, options) => {
            dialogCalls.push(options)
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
stub("../../data/tables", {
    GetOutput: async (conf, hash, index) => getOutput(hash, index),
    GetWalletInfo: async () => ({}),
})
stub("../../menu", {ShowMenu: () => ({}), SimpleMenu: () => ({})})
stub("../spend_prompt", {
    OpenSpendPrompt: async () => ({
        approve: async (actual) => {
            approveCalls.push(actual)
            return approveResponse
        },
        askPassword: async () => undefined,
        confirm: async () => false,
        close: () => {},
    }),
    SpendPromptHandlers: () => {},
})

const keystore = require("../keystore")
const {GetWallet, SetWindow, ForgetWindow} = require("../window_state")
const {Handlers} = require("../../common/util")
require("./wallet.js").WalletHandlers()

// Every temp tree is remembered and removed once the file's tests are done -
// scattering mkdtemp calls without cleanup left them accumulating in /tmp.
const tempDirs = []
test.after(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, {recursive: true, force: true})
    }
})
const tempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-handler-test-"))
    tempDirs.push(dir)
    return dir
}

// Events carry the frame url the guarded ipc surface checks; these tests play
// the app's own page, so requests present the app origin the way a real
// renderer frame would.
const e = (id) => ({sender: {id}, senderFrame: {url: "app://-/wallet"}})
const unlock = (id, walletPath) => handlers[Handlers.UnlockWallet](e(id), walletPath, "pw")
const change = (id, threshold, password) => handlers[Handlers.UpdateWallet](
    e(id), "changeSettings", {PasswordThreshold: threshold}, password)

// The scenario that shipped the bypass: two windows on one encrypted wallet,
// where a write claimed against one window's cached copy of the policy went to
// the file. The gate must ask for the password without comparing the request
// against any cache - a request for exactly the value a window already holds is
// the one the original comparison waved through.
test("a settings change on an encrypted wallet always proves the password, in every window", async () => {
    const dir = tempDir()
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

// The passwordless flows below drive a real signature end to end, so the spend
// the prompt shows is the one the keys establish - same fixture shape as the
// signer's own tests: one 10000-satoshi input the wallet controls, 9000 paid
// outside, 1000 in fee.
const {ECPair} = require("../../common/bitcoin/ecpair")
const {Transaction} = require("../../common/bitcoin/transaction")
const baddress = require("../../common/bitcoin/address")
const bscript = require("../../common/bitcoin/script")
const opcodes = require("bitcoincash-ops")
const walletKey = ECPair.fromPrivateKey(Buffer.alloc(32, 7))
const walletAddress = walletKey.getAddress()
const outsideAddress = ECPair.fromPrivateKey(Buffer.alloc(32, 9)).getAddress()
const prevHash = "11".repeat(32)

const spendRequest = () => {
    const txb = new Transaction()
    txb.addInput(Buffer.from(prevHash, "hex").reverse(), 1)
    txb.addOutput(baddress.toOutputScript(outsideAddress), 9000)
    return {
        raw: txb.toBuffer().toString("hex"),
        inputs: [{prev_hash: prevHash, prev_index: 1}],
    }
}

const servePrevout = () => {
    getOutput = async (hash, index) => hash !== prevHash || index !== 1 ? undefined : {
        hash: prevHash,
        index: 1,
        address: walletAddress,
        value: 10000,
        script: baddress.toOutputScript(walletAddress).toString("hex"),
    }
}

const passwordlessWallet = async (walletPath, settings) => {
    const wallet = keystore.NewWallet(undefined, [walletKey.toWIF()], [walletAddress])
    if (settings) {
        wallet.settings = settings
    }
    await keystore.CreateWalletFile(walletPath, wallet)
}

const openPasswordless = async (id, walletPath) => {
    SetWindow(id, {id})
    keystore.AllowPath(id, walletPath)
    assert.equal((await handlers[Handlers.UnlockWallet](e(id), walletPath, undefined)).ok, true)
}

const sign = (id) => handlers[Handlers.SignTransaction](e(id), spendRequest(), undefined)

const settle = (id, values) =>
    handlers[Handlers.UpdateWallet](e(id), "changeSettings", values, undefined)

const cleanup = (id, dir) => {
    ForgetWindow(id)
    keystore.ForgetPaths(id)
    approveCalls.length = 0
    dialogCalls.length = 0
    approveResponse = true
    dialogResponse = 0
    getOutput = async () => undefined
    fs.rmSync(dir, {recursive: true, force: true})
}

test("a passwordless wallet's send is approved in main's window, or does not happen", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "confirm_default")
    try {
        await passwordlessWallet(walletPath)
        servePrevout()
        await openPasswordless(10, walletPath)

        // Declined means nothing was signed, and the refusal is the person's.
        approveResponse = false
        const declined = await sign(10)
        assert.equal(declined.error, "spend-cancelled")
        assert.equal(approveCalls.length, 1)

        // Approved means signed - and what was approved is what the keys
        // established: the outside payment, at its real amount.
        approveResponse = true
        const signed = await sign(10)
        assert.equal(signed.ok, true)
        assert.ok(signed.value.raw.length > 0)
        assert.equal(approveCalls.length, 2)
        assert.equal(approveCalls[1].payments.length, 1)
        assert.equal(approveCalls[1].payments[0].address, outsideAddress)
        assert.equal(approveCalls[1].payments[0].value, 9000)
        assert.equal(approveCalls[1].fee, 1000)

        // The default threshold is zero, so approval opens no budget: the next
        // send asks again rather than riding the last answer.
        assert.equal(GetWallet(10).session, undefined)
        await sign(10)
        assert.equal(approveCalls.length, 3)
    } finally {
        cleanup(10, dir)
    }
})

test("a passwordless budget opens only on approval, meters silently, and closes spent", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "confirm_budget")
    try {
        // Room for two silent sends of 10000 after the approved one, not three.
        await passwordlessWallet(walletPath, {PasswordThreshold: 25000})
        servePrevout()
        await openPasswordless(11, walletPath)

        // Unlocking opened no budget: were it otherwise, anything that can call
        // unlock again could reset the meter without a person involved.
        assert.equal(GetWallet(11).session, undefined)

        // The first send asks, and the approval starts the budget.
        assert.equal((await sign(11)).ok, true)
        assert.equal(approveCalls.length, 1)
        assert.deepEqual(GetWallet(11).session, {spent: 0})

        // Two sends of 10000 fit under 25000 and ask nobody anything.
        assert.equal((await sign(11)).ok, true)
        assert.equal((await sign(11)).ok, true)
        assert.equal(approveCalls.length, 1)
        assert.deepEqual(GetWallet(11).session, {spent: 20000})

        // The third would pass the total, so it is asked for - and the fresh
        // approval starts the budget again.
        assert.equal((await sign(11)).ok, true)
        assert.equal(approveCalls.length, 2)
        assert.deepEqual(GetWallet(11).session, {spent: 0})
    } finally {
        cleanup(11, dir)
    }
})

test("confirmation off means exactly that, and turning it off is asked in main's dialog", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "confirm_off")
    try {
        await passwordlessWallet(walletPath)
        servePrevout()
        await openPasswordless(12, walletPath)
        const diskConfirms = async () =>
            keystore.PublicWallet((await keystore.ReadWallet(walletPath)).wallet)
                .settings.ConfirmSends !== false

        // The dialog declines: the setting stays, and so does the prompt.
        dialogResponse = 0
        const refused = await settle(12, {ConfirmSends: false})
        assert.notEqual(refused.error, undefined)
        assert.equal(dialogCalls.length, 1)
        assert.equal(await diskConfirms(), true)

        // The dialog allows: sends now sign with nobody asked.
        dialogResponse = 1
        assert.equal((await settle(12, {ConfirmSends: false})).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.equal(await diskConfirms(), false)
        assert.equal((await sign(12)).ok, true)
        assert.equal(approveCalls.length, 0)

        // Turning it back on tightens, so no dialog stands in the way.
        assert.equal((await settle(12, {ConfirmSends: true})).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.equal(await diskConfirms(), true)
    } finally {
        cleanup(12, dir)
    }
})

test("raising a passwordless budget is asked in main's dialog, lowering is not", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "confirm_raise")
    try {
        await passwordlessWallet(walletPath)
        await openPasswordless(13, walletPath)
        const diskThreshold = async () =>
            ((await keystore.ReadWallet(walletPath)).wallet.settings || {}).PasswordThreshold || 0

        // More may leave unseen: a person says so, or it does not happen.
        dialogResponse = 0
        assert.notEqual((await settle(13, {PasswordThreshold: 50000})).error, undefined)
        assert.equal(await diskThreshold(), 0)
        dialogResponse = 1
        assert.equal((await settle(13, {PasswordThreshold: 50000})).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.equal(await diskThreshold(), 50000)

        // Lowering the budget takes silence away from an attacker, not from the
        // owner, so it passes freely.
        assert.equal((await settle(13, {PasswordThreshold: 100})).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.equal(await diskThreshold(), 100)

        // A settings write opens no budget for a passwordless wallet, approved
        // or not - only an approved spend does.
        assert.equal(GetWallet(13).session, undefined)
    } finally {
        cleanup(13, dir)
    }
})

// The creation flow, driven over its channels: the seed is born in main, the
// confirmation is judged in main, and the create call carries a flag where the
// words used to travel.
const pendingSeed = require("../pending_seed")

test("a seed wallet is created from main's pending seed, and only once confirmed", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "seeded")
    try {
        SetWindow(14, {id: 14})
        keystore.AllowPath(14, walletPath)
        const create = (target) =>
            handlers[Handlers.CreateWallet](e(14), target, true, [], [], undefined)

        // Nothing pending, then pending but unconfirmed, then a confirmation
        // that misses: no wallet at any of those stops.
        assert.match((await create(walletPath)).error, /no confirmed seed/)
        const words = await handlers[Handlers.GenerateSeed](e(14))
        assert.match((await create(walletPath)).error, /no confirmed seed/)
        assert.equal(await handlers[Handlers.ConfirmSeed](e(14), "abandon about"), false)
        assert.match((await create(walletPath)).error, /no confirmed seed/)

        // Confirmed with main's own words, the wallet is written - holding
        // exactly what main generated, not anything the renderer chose.
        assert.equal(await handlers[Handlers.ConfirmSeed](e(14), words), true)
        assert.equal((await create(walletPath)).ok, true)
        assert.equal((await keystore.ReadWallet(walletPath)).wallet.seed, words)
        assert.equal(GetWallet(14).wallet.seed, undefined)

        // Creation consumed the pending seed: the next seed wallet starts its
        // own flow rather than reusing words already bound to a wallet.
        const againPath = path.join(dir, "seeded_again")
        keystore.AllowPath(14, againPath)
        assert.match((await create(againPath)).error, /no confirmed seed/)
    } finally {
        pendingSeed.Discard(14)
        cleanup(14, dir)
    }
})

test("an imported seed is what the wallet stores, spacing aside", async () => {
    const dir = tempDir()
    const walletPath = path.join(dir, "imported_seed")
    const phrase = "abandon abandon abandon abandon abandon abandon " +
        "abandon abandon abandon abandon abandon about"
    try {
        SetWindow(15, {id: 15})
        keystore.AllowPath(15, walletPath)
        assert.equal(await handlers[Handlers.ImportSeed](e(15), "not a mnemonic"), false)
        assert.equal(await handlers[Handlers.ImportSeed](e(15), " " + phrase.split(" ").join("  ")), true)
        const created = await handlers[Handlers.CreateWallet](e(15), walletPath, true, [], [], undefined)
        assert.equal(created.ok, true)
        assert.equal((await keystore.ReadWallet(walletPath)).wallet.seed, phrase)
    } finally {
        pendingSeed.Discard(15)
        cleanup(15, dir)
    }
})

// The audit's M4 tail: an encrypted wallet's exports are gated by knowing the
// password, but a passwordless wallet answered a bare bridge call with the
// seed. The gate is main's own dialog - the page cannot draw, cover, or
// answer it - and declining leaves nothing read.
test("a passwordless wallet's secrets go through main's dialog, or nowhere", async () => {
    const dir = tempDir()
    const seedPath = path.join(dir, "export_seed")
    const keyPath = path.join(dir, "export_key")
    const encryptedPath = path.join(dir, "export_encrypted")
    const phrase = "abandon abandon abandon abandon abandon abandon " +
        "abandon abandon abandon abandon abandon about"
    try {
        SetWindow(16, {id: 16})
        keystore.AllowPath(16, seedPath)
        assert.equal(await handlers[Handlers.ImportSeed](e(16), phrase), true)
        assert.equal((await handlers[Handlers.CreateWallet](
            e(16), seedPath, true, [], [], undefined)).ok, true)

        // Declined: no seed crosses, and the refusal is an answer the modal
        // matches on rather than an error to display.
        dialogResponse = 0
        const refusedSeed = await handlers[Handlers.ExportSeed](e(16), undefined)
        assert.equal(refusedSeed.error, "export-cancelled")
        assert.equal(refusedSeed.value, undefined)
        assert.equal(dialogCalls.length, 1)

        // Allowed: the seed in the file, and only after the dialog said so.
        dialogResponse = 1
        const allowedSeed = await handlers[Handlers.ExportSeed](e(16), undefined)
        assert.equal(allowedSeed.ok, true)
        assert.equal(allowedSeed.value, phrase)
        assert.equal(dialogCalls.length, 2)

        // A private key stands behind the same dialog.
        await passwordlessWallet(keyPath)
        await openPasswordless(17, keyPath)
        dialogResponse = 0
        const refusedKey = await handlers[Handlers.ExportPrivateKey](
            e(17), walletAddress, undefined)
        assert.equal(refusedKey.error, "export-cancelled")
        assert.equal(refusedKey.value, undefined)
        assert.equal(dialogCalls.length, 3)
        dialogResponse = 1
        const allowedKey = await handlers[Handlers.ExportPrivateKey](
            e(17), walletAddress, undefined)
        assert.equal(allowedKey.ok, true)
        assert.equal(allowedKey.value, walletKey.toWIF())
        assert.equal(dialogCalls.length, 4)

        // An encrypted wallet's gate is the password: the dialog never opens,
        // and the exports answer as they always have.
        await keystore.CreateWalletFile(encryptedPath,
            keystore.NewWallet(undefined, [walletKey.toWIF()], [walletAddress]), "pw")
        SetWindow(18, {id: 18})
        keystore.AllowPath(18, encryptedPath)
        assert.equal((await unlock(18, encryptedPath)).ok, true)
        dialogResponse = 0
        const encryptedKey = await handlers[Handlers.ExportPrivateKey](
            e(18), walletAddress, "pw")
        assert.equal(encryptedKey.ok, true)
        assert.equal(encryptedKey.value, walletKey.toWIF())
        assert.equal(dialogCalls.length, 4)
    } finally {
        pendingSeed.Discard(16)
        for (const id of [16, 17]) {
            ForgetWindow(id)
            keystore.ForgetPaths(id)
        }
        cleanup(18, dir)
    }
})
