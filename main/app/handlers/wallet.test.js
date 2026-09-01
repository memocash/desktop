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
            // Both halves are kept: which window the dialog was modal to is as
            // much a part of the gate as what it asked. A test may answer with
            // a function, to act while the dialog is up the way a renderer
            // can: the dialog only blocks the person, not the page's calls.
            dialogCalls.push({win, options})
            return {response: typeof dialogResponse === "function"
                ? await dialogResponse() : dialogResponse}
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
const opcodes = require("../../common/bitcoin/opcodes.json")
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
        slp_validity: "NOT_SLP",
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

// The injection this gate closes: a key the renderer imports on its own
// becomes an address the wallet owns, and payments routed there read as
// change - out of the outgoing total, off the leaving-payments list, past the
// send confirmation. On a passwordless wallet nothing stood between the
// handler and the write.
test("a passwordless key import is asked in main's dialog, an encrypted one is not", async () => {
    const dir = tempDir()
    const openPath = path.join(dir, "import_open")
    const encryptedPath = path.join(dir, "import_encrypted")
    const importedKey = ECPair.fromPrivateKey(Buffer.alloc(32, 5))
    const importedWIF = importedKey.toWIF()
    const importedAddress = importedKey.getAddress()
    const addKeys = (id, password) =>
        handlers[Handlers.UpdateWallet](e(id), "addKeys", [importedWIF], password)
    try {
        await passwordlessWallet(openPath)
        await openPasswordless(19, openPath)
        const onDisk = async (walletPath, password) => {
            const {wallet} = await keystore.ReadWallet(walletPath, password)
            return {keys: wallet.keys, addresses: wallet.addresses}
        }

        // The dialog declines: the refusal throws, and neither the key nor its
        // address reaches the file.
        dialogResponse = 0
        const refused = await addKeys(19, undefined)
        assert.notEqual(refused.error, undefined)
        assert.equal(dialogCalls.length, 1)
        assert.deepEqual(await onDisk(openPath),
            {keys: [walletKey.toWIF()], addresses: [walletAddress]})

        // What was asked, and of whom: main's dialog over the requesting
        // window, with Cancel both the default and Escape's answer - which is
        // what the response of 0 above declined with. Pinned here so a
        // reordering of the buttons, or a default that imports, fails this
        // test rather than shipping a fail-open prompt.
        const {win, options} = dialogCalls[0]
        assert.equal(win.id, 19)
        assert.deepEqual(options.buttons, ["Cancel", "Import"])
        assert.equal(options.defaultId, 0)
        assert.equal(options.cancelId, 0)

        // The dialog allows: the key lands, bringing the address it unlocks -
        // derived in main, not taken from the caller. Approval is the Import
        // button's own index, not a literal, so this follows the dialog's
        // real configuration instead of assuming it.
        dialogResponse = options.buttons.indexOf("Import")
        assert.notEqual(dialogResponse, options.cancelId)
        assert.equal((await addKeys(19, undefined)).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.deepEqual(await onDisk(openPath), {
            keys: [walletKey.toWIF(), importedWIF],
            addresses: [walletAddress, importedAddress],
        })

        // An encrypted wallet's gate is the password: the dialog never opens,
        // and the import writes as it always has.
        await keystore.CreateWalletFile(encryptedPath,
            keystore.NewWallet(undefined, [walletKey.toWIF()], [walletAddress]), "pw")
        SetWindow(20, {id: 20})
        keystore.AllowPath(20, encryptedPath)
        assert.equal((await unlock(20, encryptedPath)).ok, true)
        dialogResponse = 0
        assert.equal((await addKeys(20, "pw")).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.deepEqual(await onDisk(encryptedPath, "pw"), {
            keys: [walletKey.toWIF(), importedWIF],
            addresses: [walletAddress, importedAddress],
        })
    } finally {
        ForgetWindow(19)
        keystore.ForgetPaths(19)
        cleanup(20, dir)
    }
})

// Removal's gate mirrors the import's: not an injection - the owned set only
// shrinks - but destructive, since a passwordless wallet's key leaves the file
// on nothing more than a bridge call, and with no backup the coins at its
// address go with it.
test("removing a passwordless wallet's key is asked in main's dialog, an encrypted one is not", async () => {
    const dir = tempDir()
    const openPath = path.join(dir, "remove_open")
    const encryptedPath = path.join(dir, "remove_encrypted")
    const spareKey = ECPair.fromPrivateKey(Buffer.alloc(32, 6))
    const spareAddress = spareKey.getAddress()
    const twoKeyWallet = () => keystore.NewWallet(undefined,
        [walletKey.toWIF(), spareKey.toWIF()], [walletAddress, spareAddress])
    const remove = (id, password) =>
        handlers[Handlers.RemovePrivateKey](e(id), spareAddress, password)
    const onDisk = async (walletPath, password) => {
        const {wallet} = await keystore.ReadWallet(walletPath, password)
        return {keys: wallet.keys, addresses: wallet.addresses}
    }
    try {
        await keystore.CreateWalletFile(openPath, twoKeyWallet())
        await openPasswordless(21, openPath)

        // The dialog declines: the refusal throws, and the key stays with the
        // address it vouches for.
        dialogResponse = 0
        const refused = await remove(21, undefined)
        assert.notEqual(refused.error, undefined)
        assert.equal(dialogCalls.length, 1)
        assert.deepEqual(await onDisk(openPath), {
            keys: [walletKey.toWIF(), spareKey.toWIF()],
            addresses: [walletAddress, spareAddress],
        })

        // The same semantics the import pins: main's dialog over the
        // requesting window, Cancel as both the default and Escape's answer.
        const {win, options} = dialogCalls[0]
        assert.equal(win.id, 21)
        assert.deepEqual(options.buttons, ["Cancel", "Remove"])
        assert.equal(options.defaultId, 0)
        assert.equal(options.cancelId, 0)

        // The dialog allows: the key is gone, and the address it alone
        // vouched for is forgotten with it.
        dialogResponse = options.buttons.indexOf("Remove")
        assert.notEqual(dialogResponse, options.cancelId)
        assert.equal((await remove(21, undefined)).ok, true)
        assert.equal(dialogCalls.length, 2)
        assert.deepEqual(await onDisk(openPath),
            {keys: [walletKey.toWIF()], addresses: [walletAddress]})

        // The removeKeys update op is the same act through the other door, so
        // it stands behind the same dialog.
        dialogResponse = 0
        const refusedOp = await handlers[Handlers.UpdateWallet](
            e(21), "removeKeys", [walletKey.toWIF()], undefined)
        assert.notEqual(refusedOp.error, undefined)
        assert.equal(dialogCalls.length, 3)
        assert.deepEqual(await onDisk(openPath),
            {keys: [walletKey.toWIF()], addresses: [walletAddress]})

        // An encrypted wallet's gate is the password: the dialog never opens,
        // and removal answers as it always has.
        await keystore.CreateWalletFile(encryptedPath, twoKeyWallet(), "pw")
        SetWindow(22, {id: 22})
        keystore.AllowPath(22, encryptedPath)
        assert.equal((await unlock(22, encryptedPath)).ok, true)
        dialogResponse = 0
        assert.equal((await remove(22, "pw")).ok, true)
        assert.equal(dialogCalls.length, 3)
        assert.deepEqual(await onDisk(encryptedPath, "pw"),
            {keys: [walletKey.toWIF()], addresses: [walletAddress]})
    } finally {
        ForgetWindow(21)
        keystore.ForgetPaths(21)
        cleanup(22, dir)
    }
})

// The race the gate must not lose: the dialog waits on a person, and nothing
// suspends the renderer while it waits - it can open a different wallet on
// the same window before the answer lands. The approval binds to the wallet
// the person was asked about, not to whatever the window holds afterward.
test("an approved removal binds to the wallet the dialog asked about", async () => {
    const dir = tempDir()
    const askedPath = path.join(dir, "race_asked")
    const swappedPath = path.join(dir, "race_swapped")
    const spareKey = ECPair.fromPrivateKey(Buffer.alloc(32, 8))
    const spareAddress = spareKey.getAddress()
    const twoKeyWallet = () => keystore.NewWallet(undefined,
        [walletKey.toWIF(), spareKey.toWIF()], [walletAddress, spareAddress])
    const onDisk = async (walletPath) => {
        const {wallet} = await keystore.ReadWallet(walletPath)
        return {keys: wallet.keys, addresses: wallet.addresses}
    }
    try {
        // Both wallets hold the spare key, so a removal that followed the
        // window's state would find the same address in the swapped-in file.
        await keystore.CreateWalletFile(askedPath, twoKeyWallet())
        await keystore.CreateWalletFile(swappedPath, twoKeyWallet())
        await openPasswordless(23, askedPath)
        keystore.AllowPath(23, swappedPath)

        // While the dialog is up the renderer opens the other wallet on the
        // same window; then the person approves what they were asked.
        dialogResponse = async () => {
            assert.equal((await handlers[Handlers.UnlockWallet](
                e(23), swappedPath, undefined)).ok, true)
            return 1
        }
        assert.equal((await handlers[Handlers.RemovePrivateKey](
            e(23), spareAddress, undefined)).ok, true)
        assert.equal(dialogCalls.length, 1)

        // The wallet the person saw lost the key; the one opened mid-dialog
        // was never touched.
        assert.deepEqual(await onDisk(askedPath),
            {keys: [walletKey.toWIF()], addresses: [walletAddress]})
        assert.deepEqual(await onDisk(swappedPath), {
            keys: [walletKey.toWIF(), spareKey.toWIF()],
            addresses: [walletAddress, spareAddress],
        })
    } finally {
        cleanup(23, dir)
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
