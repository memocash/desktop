const {dialog, ipcMain} = require("electron");
const fs = require("fs/promises");
const path = require("path");
const {Worker} = require("worker_threads");
const {Dir, Handlers, WalletErrors} = require("../../common/util");
const {GetOutput, GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
const keystore = require("../keystore");
const {Serialize} = require("../serial");
const session = require("../session");
const {addressesForKeys} = require("../derivation");
const {normalizeSeedWalletData} = require("../seed_wallet");
const {KeyFinder, SignTransaction} = require("../transaction_signer");
const {SetWallet, GetWallet, SetMenu, GetWindow, IsOpen, CreateWindow, eConf} = require("../window");

// Runs key/address derivation in a worker thread so the CPU-intensive
// secp256k1 work never blocks the main process or the renderer UI. The worker
// derives everything from the seed in one pass and posts back a single result.
const generateWallet = ({seed, keys, derivation}) => new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(__dirname, "addressWorker.js"), {
        workerData: {seed, keys, derivation},
    })
    worker.once("message", (msg) => {
        worker.terminate()
        if (msg.error) {
            reject(new Error(msg.error))
        } else {
            resolve(msg.result)
        }
    })
    worker.once("error", reject)
    worker.once("exit", (code) => {
        if (code !== 0) {
            reject(new Error("Address worker stopped with exit code " + code))
        }
    })
})

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

// Seed wallets created by older releases stored the first 20 receive WIFs in
// the encrypted key list. Build public account keys once during unlock, remove
// only those recognizable derived WIFs, and retain any separately imported
// keys. Subsequent public address derivation can use the xpubs without exposing
// or decrypting the mnemonic.
const normalizeSeedWallet = async (filename, password) => {
    return keystore.WithWalletLock(filename, async () => {
        const read = await keystore.ReadWallet(filename, password)
        if (!read.wallet.seed) {
            return read
        }

        // The presence of versioned derivation metadata is also the migration
        // marker. Once it exists, routine unlocks use only the xpubs and do not
        // repeat mnemonic/private-key derivation.
        const derived = read.wallet.derivation
            ? {keys: [], derivation: read.wallet.derivation}
            : await generateWallet({
                seed: read.wallet.seed,
                keys: read.wallet.keys || [],
            })
        const publicDerived = await generateWallet({derivation: derived.derivation})
        const wallet = read.wallet.derivation
            ? {
                ...read.wallet,
                addresses: [...new Set([...publicDerived.addresses, ...(read.wallet.addresses || [])])],
                changeList: [...new Set([...publicDerived.changeList, ...(read.wallet.changeList || [])])],
                slpList: [...new Set([...publicDerived.slpList, ...(read.wallet.slpList || [])])],
            }
            : normalizeSeedWalletData(read.wallet, derived, publicDerived)
        const secretChanged = !same(wallet.keys, read.wallet.keys || [])
        const publicChanged = !same(keystore.PublicWallet(wallet), keystore.PublicWallet(read.wallet))
        if (secretChanged) {
            await keystore.WriteWallet(
                filename, wallet, read.encrypted ? password : undefined, read.integrityKey)
        } else if (publicChanged) {
            await keystore.UpdatePublic(filename, read.integrityKey, (publicData) => {
                const {seed, keys, canSign, walletType, ...nextPublic} =
                    keystore.PublicWallet(wallet)
                Object.assign(publicData, nextPublic)
            })
        }
        return {...read, wallet}
    })
}

const ensurePublicMetadata = async (filename, read, password) => {
    if (!read.wallet.seed) {
        return read
    }
    return normalizeSeedWallet(filename, read.encrypted ? password : undefined)
}

// The renderer used to decrypt the file itself and hand the plaintext wallet and
// password back through an ipcMain.on, which left it in charge of what main
// trusted. Now it only names a wallet and offers a password, and finds out
// whether that worked.
const unlockWallet = async (winId, walletName, password) => {
    const filename = keystore.ResolveWalletPath(winId, walletName)
    let read
    try {
        read = await keystore.ReadAndMigrateWallet(filename, password)
        read = await ensurePublicMetadata(filename, read, password)
    } catch (e) {
        if (e.message === keystore.WrongPassword) {
            return {error: keystore.WrongPassword}
        }
        throw e
    }
    const state = {
        wallet: keystore.PublicWallet(read.wallet),
        filename,
        encrypted: read.encrypted,
        integrityKey: read.integrityKey,
        session: undefined,
    }
    const {sessionKey, session: sealed} = openSession(state, password)
    rememberWallet(winId, {...state, session: sealed})
    // The key goes no further than the preload, which keeps it out of the page.
    return {ok: true, sessionKey}
}

const createWallet = async (winId, walletName, seedPhrase, keyList, addressList, password) => {
    if (!Dir.IsFullPath(walletName)) {
        await fs.mkdir(Dir.DefaultPath, {recursive: true})
    }
    const filename = keystore.ResolveWalletPath(winId, walletName)
    const wallet = keystore.NewWallet(seedPhrase, keyList, addressList)
    if (seedPhrase) {
        const derived = await generateWallet({seed: seedPhrase, keys: []})
        wallet.addresses = derived.addresses
        wallet.changeList = derived.changeList
        wallet.slpList = derived.slpList
        wallet.derivation = derived.derivation
    } else if (keyList && keyList.length) {
        // Each imported key contributes the address it unlocks. Until now nothing
        // did this on the main side: the renderer used to fill the list in on
        // first load, and when that moved out the imported-key case was left
        // creating a wallet with keys and no addresses to watch.
        wallet.addresses = [...new Set([
            ...addressesForKeys(keyList),
            ...(addressList || []),
        ])]
    }
    try {
        const integrityKey = await keystore.CreateWalletFile(filename, wallet, password)
        rememberWallet(winId, {
            wallet: keystore.PublicWallet(wallet),
            filename,
            encrypted: !!(password && password.length),
            integrityKey,
            session: undefined,
        })
    } catch (e) {
        if (e.code === "EEXIST") {
            return {error: "wallet-exists"}
        }
        throw e
    }
    return {ok: true}
}

// A wallet whose owner has set a spend budget gets a session: main keeps the
// password sealed under a key it does not retain, and hands that key to the
// renderer. Neither half is a password on its own, and a spend needs both. There
// is nothing to seal for a wallet with no password, or one whose budget is zero -
// which is every wallet until somebody raises it - so those get no session and
// are asked every time.
const openSession = (walletState, password) => {
    const threshold = spendThreshold(walletState.wallet)
    if (!walletState.encrypted || !threshold || !password) {
        return {}
    }
    const {key, envelope} = session.Seal(password)
    return {sessionKey: key, session: {envelope, spent: 0}}
}

const spendThreshold = (wallet) => {
    const settings = (wallet && wallet.settings) || {}
    const threshold = settings[keystore.ThresholdSetting]
    return Number.isSafeInteger(threshold) && threshold > 0 ? threshold : 0
}

// An update can outlive the window that asked for it: several are queued behind
// the wallet's lock, and the window can be closed while they wait. The file is
// written either way, but a closed window's state must stay closed rather than
// being put back in the map for whatever window is handed that id next.
const rememberWallet = (winId, state) => {
    if (IsOpen(winId)) {
        // Merged over what is there, so an update that speaks only of the wallet
        // doesn't quietly discard the session alongside it. Clearing something
        // means naming it, as ending a session does.
        SetWallet(winId, {...GetWallet(winId), ...state})
    }
}

// The addresses to stop watching when keys are removed: the ones those keys
// unlocked, minus any the wallet can still reach another way. A seed wallet is
// allowed to hold an imported copy of a key it also derives - exporting a receive
// WIF and importing it back is enough - and forgetting that address would leave
// the wallet blind to coins it still controls, and refusing them as inputs.
// Called after the keys are gone from the wallet, so a removed key cannot vouch
// for its own address, and before the addresses are, so seed derivation can still
// find each one at its list position.
const forgottenAddresses = (wallet, removedKeys) => {
    const controls = KeyFinder(wallet)
    return addressesForKeys(removedKeys).filter((address) => !controls(address))
}

// Re-reads from disk before mutating, the way the preload versions did, so two
// windows open on the same file don't overwrite each other's lists. The whole
// read-modify-write holds the file's lock, since the wallet page fires several
// of these at once as it mounts.
//
// An update that only touches public metadata - which is all of them except the
// imported keys - rewrites the public half and leaves the encrypted envelope
// alone, so the common case never decrypts anything.
const updateWallet = async (winId, op, values, password) => {
    const {filename, encrypted, integrityKey, wallet: held} = GetWallet(winId)
    // A wallet that can sign gets its addresses from its own keys: seed
    // derivation at unlock, or the imported key that unlocks each one. Letting a
    // renderer name one directly would put an address the wallet cannot spend in
    // the same list as the ones it can, which is the shape of list a signing
    // decision must never trust. Removal stays open - it takes nothing away from
    // the wallet, and existing files may have such addresses to clean up.
    if (op === "addAddresses" && held && held.canSign) {
        throw new Error("a wallet with keys derives its own addresses")
    }
    // The threshold decides when a spend needs the password, so changing it
    // needs the password. Otherwise anything that can reach this handler could
    // raise its own spending limit, and the budget would bound nothing. Reading
    // the wallet with the offered password is the proof; it throws WrongPassword
    // if it isn't one, before anything is written.
    const changingThreshold = op === "changeSettings" && values &&
        values[keystore.ThresholdSetting] !== undefined &&
        values[keystore.ThresholdSetting] !== spendThreshold(held)
    if (changingThreshold && encrypted) {
        await keystore.ReadWallet(filename, password)
    }
    await keystore.WithWalletLock(filename, async () => {
        if (keystore.UpdateTouchesSecret(op)) {
            const {wallet: stored} = await keystore.ReadWallet(
                filename, encrypted ? password : undefined)
            keystore.ApplyWalletUpdate(stored, op, values)
            // An imported key brings its address with it, derived here from the
            // key rather than taken from the caller.
            if (op === "addKeys") {
                keystore.ApplyWalletUpdate(stored, "addAddresses", addressesForKeys(values))
            } else {
                keystore.ApplyWalletUpdate(stored, "removeAddresses",
                    forgottenAddresses(stored, values))
            }
            await keystore.WriteWallet(
                filename, stored, encrypted ? password : undefined, integrityKey)
            rememberWallet(winId, {wallet: keystore.PublicWallet(stored), filename, encrypted, integrityKey})
            return
        }
        const publicData = await keystore.UpdatePublic(filename, integrityKey, (data) =>
            keystore.ApplyWalletUpdate(data, op, values))
        // Read the held wallet inside the lock: a key update queued ahead of
        // this one would make a snapshot taken outside it stale, and merging
        // over that would put the old keys back.
        const current = GetWallet(winId)
        if (current) {
            rememberWallet(winId, {
                wallet: {...current.wallet, ...publicData}, filename, encrypted, integrityKey,
                // A new budget starts from nothing: the session sealed under the
                // old policy doesn't carry over into the new one.
                session: changingThreshold ? undefined : current.session,
            })
        }
    })
}

const readForOperation = async (winId, password) => {
    const {filename, encrypted} = GetWallet(winId)
    return keystore.ReadWallet(filename, encrypted ? password : undefined)
}

const operationResult = async (run) => {
    try {
        return {ok: true, value: await run()}
    } catch (e) {
        if (e.message === keystore.WrongPassword) {
            return {error: keystore.WrongPassword}
        }
        throw e
    }
}

const exportPrivateKey = async (winId, address, password) => {
    const {wallet} = await readForOperation(winId, password)
    const derived = await generateWallet({seed: wallet.seed, keys: wallet.keys})
    let index = derived.addresses.indexOf(address)
    if (index !== -1) {
        if (index < derived.keys.length) {
            return derived.keys[index]
        }
        return wallet.keys[index - derived.keys.length]
    }
    index = derived.changeList.indexOf(address)
    if (index !== -1) {
        return derived.changeKeys[index]
    }
    index = derived.slpList.indexOf(address)
    if (index !== -1) {
        return derived.slpKeys[index]
    }
    const publicAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
    if (publicAddresses.includes(address)) {
        return undefined
    }
    throw new Error("address not found in wallet")
}

const removePrivateKey = async (winId, address, password) => {
    const state = GetWallet(winId)
    const {wallet: stored} = await readForOperation(winId, password)
    const key = await exportPrivateKey(winId, address, password)
    if (!key || !(stored.keys || []).includes(key)) {
        throw new Error("address is not backed by an imported key")
    }
    keystore.ApplyWalletUpdate(stored, "removeKeys", [key])
    keystore.ApplyWalletUpdate(stored, "removeAddresses", forgottenAddresses(stored, [key]))
    await keystore.WriteWallet(
        state.filename, stored, state.encrypted ? password : undefined, state.integrityKey)
    rememberWallet(winId, {...state, wallet: keystore.PublicWallet(stored)})
}

const satoshis = (value) => value.toLocaleString("en-US") + " satoshis"

// Asked by main, in a window the renderer cannot draw over or dismiss, before
// anything that pays an address the wallet doesn't own. The password gate alone
// can't cover this: the renderer draws the password prompt, so it chooses the
// moment to ask, and once it has a password nothing in the signer cares where
// the outputs point. This is where the person at the keyboard sees where their
// money is actually going. Cancel is the default button, so a stray return key
// declines rather than sends.
// A token output moves value the satoshis say nothing about, and a mint baton
// hands over the authority to create more of the token, so both are named ahead
// of the dust that carries them.
const describePayment = ({address, value, tokenAmount, baton}) => {
    const carried = []
    if (tokenAmount) {
        carried.push(tokenAmount + " tokens")
    }
    if (baton) {
        carried.push("the mint baton, which is the authority to mint more of this token")
    }
    carried.push(satoshis(value))
    return carried.join(" plus ") + "\nto " + (address || "an unrecognized script")
}

const confirmSpend = (e) => async ({payments, fee}) => {
    const total = payments.reduce((sum, {value}) => sum + value, 0)
    const destinations = payments.map(describePayment).join("\n\n")
    const tokens = payments.some(({tokenAmount, baton}) => tokenAmount || baton)
    const {response} = await dialog.showMessageBox(GetWindow(e.sender.id), {
        type: "question",
        title: "Confirm send",
        message: (tokens ? "Send tokens and " : "Send ") + satoshis(total) +
            " out of this wallet?",
        detail: destinations + "\n\nNetwork fee: " + satoshis(fee),
        buttons: ["Cancel", "Send"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    })
    return response === 1
}

// The password for this signature: the one that was typed, or the session's, if
// the caller can produce the key that opens it. A session key that doesn't open
// the envelope is treated exactly like having no session - the caller is asked
// for the password rather than told which half was wrong.
const spendPassword = (winId, password, sessionKey) => {
    if (password !== undefined && password !== null) {
        return password
    }
    const state = GetWallet(winId)
    if (!state.encrypted) {
        return undefined
    }
    return state.session && session.Open(state.session.envelope, sessionKey)
}

// What the budget has left. Tokens are never covered by it: an SLP transfer
// moves whatever the token is worth on a few hundred satoshis of dust, so no
// figure in satoshis can stand in for the owner's consent to it.
const withinBudget = (winId, {outgoing, carriesTokens}) => {
    const state = GetWallet(winId)
    const threshold = spendThreshold(state.wallet)
    if (carriesTokens || !state.session) {
        return false
    }
    return state.session.spent + outgoing <= threshold
}

// Records what the session has spent, and closes it once the budget is gone:
// the sealed password is dropped, so the key the renderer holds opens nothing
// and the next spend has to be authorised again.
const chargeSession = (winId, outgoing) => {
    const state = GetWallet(winId)
    // Signing takes long enough for the window to close underneath it, or for
    // another spend to have closed the session already. Either way there is
    // nothing left to charge.
    if (!state || !state.session) {
        return
    }
    const spent = state.session.spent + outgoing
    rememberWallet(winId, {
        session: spent < spendThreshold(state.wallet) ? {...state.session, spent} : undefined,
    })
}

// One signature at a time per window. The budget is checked before the
// confirmation dialog and charged after it, and a dialog waits on a person, so
// without this two sends can both be told there is room and both be signed -
// each of them inside the budget, together well past it. Queued per window
// rather than globally, so one window's open dialog doesn't hold up another's.
const signTransaction = async (e, request, password, sessionKey) =>
    Serialize("sign:" + e.sender.id, () => signOne(e, request, password, sessionKey))

const signOne = async (e, request, password, sessionKey) => {
    const winId = e.sender.id
    try {
        const spending = spendPassword(winId, password, sessionKey)
        const state = GetWallet(winId)
        if (state.encrypted && spending === undefined) {
            return {error: WalletErrors.PasswordRequired}
        }
        // Spending on the session's authority is metered; spending on a password
        // that was just typed is not. The check happens inside the signer, where
        // the outgoing amount is known from the authoritative input values and
        // before any key work or any confirmation - nobody should be asked to
        // approve a send that is about to be refused.
        const onSession = (password === undefined || password === null) && state.encrypted
        const {wallet} = await readForOperation(winId, spending)
        const value = await SignTransaction({
            raw: request.raw,
            inputs: request.inputs,
            beatHash: request.beatHash,
            wallet,
            getOutput: (hash, index) => GetOutput(eConf(e), hash, index),
            authorizeSpend: onSession ? (spend) => withinBudget(winId, spend) : undefined,
            confirmSpend: confirmSpend(e),
        })
        if (onSession) {
            chargeSession(winId, value.outgoing)
            return {ok: true, value}
        }
        if (password === undefined || password === null) {
            return {ok: true, value}
        }
        // Typing the password starts the budget again from the moment somebody
        // proved they were there, which is also how a spent session is renewed.
        const current = GetWallet(winId)
        if (!current) {
            return {ok: true, value}
        }
        const {sessionKey: renewed, session: sealed} = openSession(current, password)
        rememberWallet(winId, {session: sealed})
        return {ok: true, value, sessionKey: renewed}
    } catch (error) {
        return {error: error.message === keystore.WrongPassword ?
            keystore.WrongPassword : error.message}
    }
}

const readNetworkConfig = async () => {
    try {
        return JSON.parse(await fs.readFile(Dir.NetworkConfigFile, {encoding: "utf8"}))
    } catch (e) {
        return undefined
    }
}

const WalletHandlers = () => {
    // Only the public wallet crosses to the renderer. The window state around it
    // holds the path and the key that authenticates public metadata, neither of
    // which the renderer has a use for; GetWalletFileInfo names the file.
    ipcMain.handle(Handlers.GetWallet, async (e) => (GetWallet(e.sender.id) || {}).wallet)
    ipcMain.handle(Handlers.GetWalletInfo, async (e, addresses) => GetWalletInfo(eConf(e), addresses))
    ipcMain.handle(Handlers.AuthenticateWallet, async (e, password) =>
        operationResult(async () => {
            await readForOperation(e.sender.id, password)
        }))
    ipcMain.handle(Handlers.ExportSeed, async (e, password) =>
        operationResult(async () => (await readForOperation(e.sender.id, password)).wallet.seed))
    ipcMain.handle(Handlers.ExportPrivateKey, async (e, address, password) =>
        operationResult(() => exportPrivateKey(e.sender.id, address, password)))
    ipcMain.handle(Handlers.RemovePrivateKey, async (e, address, password) =>
        operationResult(() => keystore.WithWalletLock(
            GetWallet(e.sender.id).filename,
            () => removePrivateKey(e.sender.id, address, password))))
    ipcMain.handle(Handlers.CheckWalletFile, async (e, walletName) =>
        keystore.WalletFileExists(e.sender.id, walletName))
    ipcMain.handle(Handlers.GetExistingWalletFiles, async () => keystore.ListWalletFiles())
    ipcMain.handle(Handlers.WalletFileIsEncrypted, async (e, walletName) =>
        keystore.WalletFileIsEncrypted(e.sender.id, walletName))
    ipcMain.handle(Handlers.UnlockWallet, async (e, walletName, password) =>
        unlockWallet(e.sender.id, walletName, password))
    ipcMain.handle(Handlers.CreateWallet, async (e, walletName, seedPhrase, keyList, addressList, password) =>
        createWallet(e.sender.id, walletName, seedPhrase, keyList, addressList, password))
    ipcMain.handle(Handlers.UpdateWallet, async (e, op, values, password) =>
        operationResult(async () => {
            await updateWallet(e.sender.id, op, values, password)
        }))
    ipcMain.handle(Handlers.GetWalletFileInfo, async (e) => {
        const {filename, encrypted} = GetWallet(e.sender.id)
        return {filename, name: path.parse(filename).name, encrypted}
    })
    ipcMain.handle(Handlers.GetNetworkConfig, async () => readNetworkConfig())
    ipcMain.handle(Handlers.SaveNetworkConfig, async (e, networkConfig) => {
        await fs.writeFile(Dir.NetworkConfigFile, JSON.stringify(networkConfig, null, 2) + "\n")
    })
    ipcMain.handle(Handlers.SignTransaction, signTransaction)
    ipcMain.on(Handlers.WalletLoaded, (e) => {
        SetMenu(e.sender.id, menu.ShowMenu(GetWindow(e.sender.id), CreateWindow, GetWallet(e.sender.id).wallet))
        const walletName = path.parse(GetWallet(e.sender.id).filename).name
        GetWindow(e.sender.id).title = "Memo - " + walletName
    })
}

module.exports = {
    WalletHandlers: WalletHandlers,
}
