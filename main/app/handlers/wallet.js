const {ipcMain} = require("electron");
const fs = require("fs/promises");
const path = require("path");
const {Worker} = require("worker_threads");
const {Dir, Handlers, Listeners, WalletErrors} = require("../../common/util");
const {GetOutput, GetWalletInfo} = require("../../data/tables");
const menu = require("../../menu");
const keystore = require("../keystore");
const {Serialize} = require("../serial");
const {OpenSpendPrompt} = require("../spend_prompt");
const {CoversSpend} = require("../spend_match");
const {CreateSignRelay} = require("../sign_relay");
const session = require("../session");
const {addressesForKeys} = require("../derivation");
const {normalizeSeedWalletData} = require("../seed_wallet");
const {KeyFinder, PreviewSpend, SignTransaction} = require("../transaction_signer");
const {
    SetWallet, GetWallet, SetMenu, GetWindow, IsOpen, CreateWindow, CopyWalletToTxWindows,
    TxWindowParent, eConf,
} = require("../window");

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
        // The derivation counts as a change to the envelope, not to the public
        // half: it is written inside it, so establishing one the first time needs
        // the whole file rewritten rather than a public update. Unlock is where
        // the password is, which is why this is the only place that can do it.
        const secretChanged = !same(wallet.keys, read.wallet.keys || []) ||
            !same(wallet.derivation, read.wallet.derivation)
        const publicChanged = !same(keystore.PublicWallet(wallet), keystore.PublicWallet(read.wallet))
        if (secretChanged) {
            await keystore.WriteWallet(
                filename, wallet, read.encrypted ? password : undefined, read.integrityKey)
        } else if (publicChanged) {
            await keystore.UpdatePublic(filename, read.integrityKey, (publicData) => {
                // canSign and walletType are read off the wallet for the
                // renderer's benefit rather than stored, so they do not go to
                // disk. PublicWallet has already dropped what belongs inside the
                // envelope.
                const {canSign, walletType, ...nextPublic} = keystore.PublicWallet(wallet)
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
            return {error: WalletErrors.WalletExists}
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
    if (!IsOpen(winId)) {
        return
    }
    // Merged over what is there, so an update that speaks only of the wallet
    // doesn't quietly discard the session alongside it. Clearing something
    // means naming it, as ending a session does.
    SetWallet(winId, {...GetWallet(winId), ...state})
    // Any transaction window opened from here still holds the wallet as it stood
    // when it opened; the rules for putting this one in front of it live with the
    // state they touch.
    if (state.wallet !== undefined) {
        CopyWalletToTxWindows(winId, state.wallet)
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
    // The new budget opens here, on the password that was just proved to set it.
    // Waiting for the next spend to ask instead would charge the same password
    // twice for one decision: once to say how much may go without it, and again
    // for the first send under that limit. A threshold of zero opens nothing,
    // which is how it goes back to asking every time.
    if (!changingThreshold || !encrypted) {
        return {}
    }
    const updated = GetWallet(winId)
    if (!updated) {
        return {}
    }
    const {sessionKey, session: sealed} = openSession(updated, password)
    rememberWallet(winId, {session: sealed})
    return {sessionKey}
}

const readForOperation = async (winId, password) => {
    const {filename, encrypted} = GetWallet(winId)
    return keystore.ReadWallet(filename, encrypted ? password : undefined)
}

// Every caller of these reads a result rather than catching: `const {error} =
// await ...`. Letting anything but WrongPassword reject would make that
// destructuring throw at the call site, so the message a handler raises
// deliberately - "address is not backed by an imported key" - would never reach
// the dialog meant to show it. Answers are results here, whatever the answer.
//
// A thrown value with no message would become {error: undefined}, which every
// `if (error)` reads as success - the one failure shape that could still pass
// through silently. WrongPassword is a message like any other, and the renderer
// compares against the same constant this module throws.
const asError = (e) => ({error: (e && e.message) || String(e)})

const operationResult = async (run) => {
    try {
        return {ok: true, value: await run()}
    } catch (e) {
        return asError(e)
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

// The password behind this signature, if the caller can produce the key that
// opens the session holding it. A key that doesn't open the envelope is treated
// exactly like having no session - the caller is asked for the password rather
// than told which half was wrong.
const spendPassword = (winId, sessionKey) => {
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
    // Signing spans a prevout lookup and key derivation, which is long enough for
    // the window to close underneath it - the same reason chargeSession guards.
    if (carriesTokens || !state || !state.session) {
        return false
    }
    return state.session.spent + outgoing <= spendThreshold(state.wallet)
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

// A preview window has no session key of its own: the key lives in the preload
// of the window that unlocked the wallet, and a new window gets a new preload.
// Moving the key here would put both halves in main for the length of the hop,
// which is the one thing the split exists to prevent, so the request travels to
// the parent window's preload instead and comes back signed. Main relays both
// ways and never holds the key.
//
// This grants the preview nothing its parent didn't already have: the budget is
// the parent's, checked and charged against the parent's session, and a payment
// leaving the wallet is still confirmed - over the parent window, since that is
// whose session pays for it.
//
// A parent that cannot answer - closed, or reloaded and no longer holding the
// listener - leaves the preview to ask for itself, in main's own window. The one
// thing that must not happen is the preview waiting on an answer that is never
// coming, so every way out of here settles it.
const relay = CreateSignRelay()

const signOnParentSession = async (e, request) => {
    const parentId = TxWindowParent(e.sender.id)
    const parent = parentId === undefined ? undefined : GetWindow(parentId)
    if (!parent || parent.isDestroyed()) {
        return signHere(e, request)
    }
    // Held rather than reached for again: a destroyed window throws on the way to
    // its webContents, and the listeners still have to come off.
    const contents = parent.webContents
    let abandon
    const relayed = await relay.Ask({
        owner: parentId,
        unanswered: undefined,
        dispatch: (id) => {
            // A prompt waits on a person, so there is no useful timeout here.
            // What ends the wait early is the parent's document going away: a
            // closed window, or a reload that takes the listener with it.
            abandon = () => relay.Abandon(id, undefined)
            contents.once("destroyed", abandon)
            contents.once("did-start-loading", abandon)
            contents.send(Listeners.SignOnSession, {id, request})
        },
        release: () => {
            contents.off("destroyed", abandon)
            contents.off("did-start-loading", abandon)
        },
    })
    return relayed === undefined ? signHere(e, request) : relayed
}

// The reply comes from the preload the request was sent to, and only from there.
const signOnSessionResult = (e, {id, result}) =>
    relay.Answer({owner: e.sender.id, id, result})

// One signature at a time per window. The budget is checked before anyone is
// asked anything and charged after the signature, and a prompt waits on a
// person, so without this two sends can both be told there is room and both be
// signed - each of them inside the budget, together well past it. Queued per
// window rather than globally, so one window's open prompt doesn't hold up
// another's.
const signTransaction = async (e, request, sessionKey) =>
    Serialize("sign:" + e.sender.id, () => signOne(e, request, sessionKey))

// Signing for a window with nowhere to relay to, which asks in main's own window
// rather than offering the request back to a parent that has already declined it
// or gone.
const signHere = async (e, request) =>
    Serialize("sign:" + e.sender.id, () => signOne(e, request, undefined, false))

// Signing what the renderer built, on one of two authorities: a session with
// budget left, which asks nobody anything, or a password typed into main's own
// window, which also confirms where the money is going. Which one applies is
// decided here and never by the caller - the renderer offers a session key it
// cannot read and finds out whether that was enough.
const signOne = async (e, request, sessionKey, mayRelay = true) => {
    const winId = e.sender.id
    try {
        const state = GetWallet(winId)
        const sign = async ({wallet, metered, confirmSpend}) => SignTransaction({
            raw: request.raw,
            inputs: request.inputs,
            beatHash: request.beatHash,
            wallet,
            getOutput: (hash, index) => GetOutput(eConf(e), hash, index),
            authorizeSpend: metered ? (spend) => withinBudget(winId, spend) : undefined,
            confirmSpend,
        })
        // Nothing is ever asked of a wallet with no password, so by the same rule
        // nothing is confirmed for one either.
        if (!state.encrypted) {
            return {ok: true, value: await sign({
                wallet: (await readForOperation(winId)).wallet,
                confirmSpend: async () => true,
            })}
        }
        const spending = spendPassword(winId, sessionKey)
        if (spending !== undefined) {
            try {
                // Inside the budget is exactly what the budget means: it goes
                // through with nothing shown. The check happens in the signer,
                // where the outgoing amount is known from the authoritative input
                // values rather than from anything the renderer said.
                const value = await sign({
                    wallet: (await readForOperation(winId, spending)).wallet,
                    metered: true,
                    confirmSpend: async () => true,
                })
                chargeSession(winId, value.outgoing)
                return {ok: true, value}
            } catch (error) {
                if (error.message !== WalletErrors.PasswordRequired) {
                    throw error
                }
                // Over the budget. Nothing has been signed and nobody has been
                // asked anything yet, so fall through and ask properly.
            }
        } else if (mayRelay && TxWindowParent(winId) !== undefined) {
            // A preview window holds no key, but the window it was opened from
            // may hold one with budget to spare. Let it try there before anyone
            // is asked to type anything; its preload relays and comes back here
            // as that window.
            return {error: WalletErrors.PasswordRequired}
        }
        // Read once with the public address lists, to have something true enough
        // to show while asking for the password. What the keys say is checked
        // against it before anything is signed.
        const preview = await PreviewSpend({
            raw: request.raw,
            inputs: request.inputs,
            wallet: state.wallet,
            getOutput: (hash, index) => GetOutput(eConf(e), hash, index),
        })
        return await promptedSign(winId, sign, preview)
    } catch (error) {
        return {error: error.message === keystore.WrongPassword ?
            keystore.WrongPassword : error.message}
    }
}

// Where the money goes and the password for it, together in main's own window.
// The destinations come from the wallet's public address lists, which is as much
// as can be read before the password is in - and for a wallet that can sign,
// those lists are main's own work: it derives them and refuses to add any on a
// renderer's word. Once the wallet is open the same transaction is read again
// from the keys, and a signature is only granted on the strength of the first
// answer where the second agrees. Where it doesn't, the window says so and asks
// again against what the keys establish.
const promptedSign = async (winId, sign, preview) => {
    const prompt = await OpenSpendPrompt(GetWindow(winId))
    try {
        for (let wrong = false; ; wrong = true) {
            const password = await prompt.askPassword({...preview, wrong})
            if (password === undefined) {
                return {error: WalletErrors.SpendCancelled}
            }
            let wallet
            try {
                wallet = (await readForOperation(winId, password)).wallet
            } catch (error) {
                if (error.message === keystore.WrongPassword) {
                    continue
                }
                throw error
            }
            const value = await sign({
                wallet,
                confirmSpend: async (actual) =>
                    CoversSpend(preview, actual) || prompt.confirm(actual),
            })
            // Typing the password starts the budget again from the moment
            // somebody proved they were there, which is also how a session that
            // has spent its budget is renewed.
            const current = GetWallet(winId)
            if (!current) {
                return {ok: true, value}
            }
            const {sessionKey: renewed, session: sealed} = openSession(current, password)
            rememberWallet(winId, {session: sealed})
            return {ok: true, value, sessionKey: renewed}
        }
    } finally {
        prompt.close()
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
        operationResult(() => keystore.WalletFileExists(e.sender.id, walletName)))
    ipcMain.handle(Handlers.GetExistingWalletFiles, async () => keystore.ListWalletFiles())
    ipcMain.handle(Handlers.WalletFileIsEncrypted, async (e, walletName) =>
        operationResult(() => keystore.WalletFileIsEncrypted(e.sender.id, walletName)))
    // These two answer in their own shape - a session key beside the ok, the
    // named wallet that is in the way - so only the failure needs wrapping.
    ipcMain.handle(Handlers.UnlockWallet, async (e, walletName, password) =>
        unlockWallet(e.sender.id, walletName, password).catch(asError))
    ipcMain.handle(Handlers.CreateWallet, async (e, walletName, seedPhrase, keyList, addressList, password) =>
        createWallet(e.sender.id, walletName, seedPhrase, keyList, addressList, password).catch(asError))
    ipcMain.handle(Handlers.UpdateWallet, async (e, op, values, password) => {
        const result = await operationResult(() => updateWallet(e.sender.id, op, values, password))
        // A settings change that opened a budget hands its key back the way
        // unlocking does, for the preload to keep out of the page.
        return result.ok ? {ok: true, ...result.value} : result
    })
    ipcMain.handle(Handlers.GetWalletFileInfo, async (e) => {
        const {filename, encrypted} = GetWallet(e.sender.id)
        return {filename, name: path.parse(filename).name, encrypted}
    })
    ipcMain.handle(Handlers.GetNetworkConfig, async () => readNetworkConfig())
    ipcMain.handle(Handlers.SaveNetworkConfig, async (e, networkConfig) => {
        await fs.writeFile(Dir.NetworkConfigFile, JSON.stringify(networkConfig, null, 2) + "\n")
    })
    ipcMain.handle(Handlers.SignTransaction, signTransaction)
    ipcMain.handle(Handlers.SignOnParentSession, signOnParentSession)
    ipcMain.on(Handlers.SignOnSessionResult, signOnSessionResult)
    ipcMain.on(Handlers.WalletLoaded, (e) => {
        SetMenu(e.sender.id, menu.ShowMenu(GetWindow(e.sender.id), CreateWindow, GetWallet(e.sender.id).wallet))
        const walletName = path.parse(GetWallet(e.sender.id).filename).name
        GetWindow(e.sender.id).title = "Memo - " + walletName
    })
}

module.exports = {
    WalletHandlers: WalletHandlers,
}
