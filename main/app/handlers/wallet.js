const {ipcMain} = require("../ipc");
const {dialog} = require("electron");
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
const pendingSeed = require("../pending_seed");
const {addressesForKeys} = require("../derivation");
const {normalizeSeedWalletData} = require("../seed_wallet");
const {KeyFinder, PreviewSpend, SignTransaction, WalletAddresses} = require("../transaction_signer");
const {CreateWindow, eConf} = require("../window");
const {
    SetWallet, GetWallet, SetMenu, GetWindow, CopyPublicToFileWindows,
    CopyWalletToTxWindows, TxWindowParent,
} = require("../window_state");

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
        // marker. Once it exists, routine unlocks derive the addresses from the
        // xpubs alone and offer no legacy keys to remove; a first unlock derives
        // everything - addresses, metadata, and the recognizable legacy WIFs -
        // from the mnemonic in one worker pass.
        const derived = read.wallet.derivation
            ? {
                keys: [],
                derivation: read.wallet.derivation,
                ...await generateWallet({derivation: read.wallet.derivation}),
            }
            : await generateWallet({
                seed: read.wallet.seed,
                keys: read.wallet.keys || [],
            })
        const wallet = normalizeSeedWalletData(read.wallet, derived)
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

// The renderer used to decrypt the file itself and hand the plaintext wallet and
// password back through an ipcMain.on, which left it in charge of what main
// trusted. Now it only names a wallet and offers a password, and finds out
// whether that worked.
const unlockWallet = async (winId, walletName, password) => {
    const filename = keystore.ResolveWalletPath(winId, walletName)
    let read
    try {
        read = await keystore.ReadAndMigrateWallet(filename, password)
        if (read.wallet.seed) {
            read = await normalizeSeedWallet(filename, read.encrypted ? password : undefined)
        }
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

// The seed never arrives in this call: a seed wallet says so with a flag, and
// the words come from the pending seed main has been holding for this window -
// generated or imported there, and confirmed there. The renderer's part in
// naming the seed ended when it could generate one; see ../pending_seed.
const createWallet = async (winId, walletName, useSeed, keyList, addressList, password) => {
    const seedPhrase = useSeed ? pendingSeed.Use(winId) : undefined
    if (!Dir.IsFullPath(walletName)) {
        await fs.mkdir(Dir.DefaultPath, {recursive: true, mode: 0o700})
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
    // The wallet holds the seed now; nothing is waiting to be created anymore.
    // Dropped only on success, so a refused name doesn't cost the words the
    // person just finished confirming.
    pendingSeed.Discard(winId)
    return {ok: true}
}

// A wallet whose owner has set a spend budget gets a session: main keeps the
// password sealed under a key it does not retain, and hands that key to the
// renderer. Neither half is a password on its own, and a spend needs both. There
// is nothing to seal for a wallet with no password, or one whose budget is zero -
// which is every wallet until somebody raises it - so those get no session here.
//
// A passwordless wallet's budget session opens in one place only: after a person
// approves a spend in main's own window (see approvedSign). Opening one here -
// at unlock, or on a settings write - would let a renderer reset the budget for
// free by asking again, which costs an encrypted wallet the password every time
// and would cost a passwordless one nothing.
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

// Whether a wallet with no password puts its sends in front of a person at all.
// On unless its owner turned it off - including for files from before the
// setting existed, which read as the default.
const confirmsSends = (wallet) => {
    const settings = (wallet && wallet.settings) || {}
    return settings[keystore.ConfirmSetting] !== false
}

// An update can outlive the window that asked for it: several are queued behind
// the wallet's lock, and the window can be closed while they wait. The file is
// written either way, but a closed window's state must stay closed rather than
// being put back in the map for whatever window is handed that id next.
const rememberWallet = (winId, state) => {
    if (!GetWindow(winId)) {
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
    // The settings decide when a spend needs the password, so changing them
    // needs the password. Otherwise anything that can reach this handler could
    // raise its own spending limit, and the budget would bound nothing. The gate
    // deliberately does not compare the requested value against anything: an
    // earlier version skipped the proof when the new threshold matched this
    // window's cached copy, which made a stale cache the authority on whether
    // the most security-sensitive write in the app was authenticated. Reading
    // the wallet with the offered password is the proof; it throws WrongPassword
    // if it isn't one, before anything is written.
    const changingSettings = op === "changeSettings"
    if (changingSettings && encrypted) {
        await keystore.ReadWallet(filename, password)
    }
    // The same rule with no password to prove: the settings decide when a spend
    // is put in front of a person, so a change that loosens that - turning
    // confirmation off, or raising how much may leave unseen - is itself put in
    // front of a person, in main's own window. Otherwise anything that can
    // reach this handler could quietly grant itself the silent sends the
    // confirmation exists to prevent. Tightening passes freely: taking
    // protection away from an attacker needs no ceremony.
    if (changingSettings && !encrypted) {
        await confirmLoosenedSpending(winId, filename, values)
    }
    // An imported key widens what the wallet calls its own: its address joins
    // the owned lists, so payments routed there read as change - kept out of
    // the outgoing total and the leaving-payments list a send confirmation
    // shows. On an encrypted wallet the import already needs the password,
    // because the keys live in the secret envelope. With no password to prove,
    // the import is put in front of the person at the machine - otherwise
    // anything that can reach this handler could slip in a key it generated
    // and collect "change" at an address it controls.
    if (op === "addKeys" && !encrypted) {
        await confirmKeyImport(winId)
    }
    // Removal is the same list through the other door, gated the same way. It
    // injects nothing - the owned set only shrinks - but it is destructive:
    // the key leaves the file, and without a backup the coins at its address
    // are unspendable. An encrypted wallet's gate stays the password the
    // envelope read demands.
    if (op === "removeKeys" && !encrypted) {
        await confirmKeyRemoval(winId)
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
            CopyPublicToFileWindows(filename, keystore.PublicWallet(stored), false)
            return
        }
        const publicData = await keystore.UpdatePublic(filename, integrityKey, (data) =>
            keystore.ApplyWalletUpdate(data, op, values))
        // The write went to the file, so it goes in front of every window open
        // on the file - a sibling wallet window left with the old settings would
        // go on sealing and spending sessions against a budget its owner has
        // already withdrawn. Run inside the lock: a key update queued ahead of
        // this one would make a snapshot taken outside it stale, and merging
        // over that would put the old keys back. A settings change ends every
        // session on the file - each was sealed against the old policy - and
        // the window that proved the password gets a fresh one below.
        CopyPublicToFileWindows(filename, publicData, changingSettings)
    })
    // The new budget opens here, on the password that was just proved to set it.
    // Waiting for the next spend to ask instead would charge the same password
    // twice for one decision: once to say how much may go without it, and again
    // for the first send under that limit. A threshold of zero opens nothing,
    // which is how it goes back to asking every time. A passwordless wallet
    // opens nothing here either way: its budget starts at the first approved
    // spend, never on a settings write (see openSession for why).
    if (!changingSettings) {
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

// Reads the wallet a captured state names. Callers whose gate and read must
// agree - the exports, which decide whether to show a dialog and then read a
// secret - capture the window's state once and hand it to both, so a renderer
// that switches the window to another wallet between the two moments changes
// neither what was judged nor what is read.
const readCaptured = (state, password) =>
    keystore.ReadWallet(state.filename, state.encrypted ? password : undefined)

const readForOperation = async (winId, password) =>
    readCaptured(GetWallet(winId), password)

// Asks the person at the machine whether a passwordless wallet may loosen its
// spend confirmation. Judged against the file, not any window's cache, and
// asked in a native dialog the page cannot draw, cover, or answer. Declining
// throws, so nothing is written.
const confirmLoosenedSpending = async (winId, filename, values) => {
    const stored = keystore.PublicWallet((await keystore.ReadWallet(filename)).wallet)
    const current = stored.settings
    const requested = {...current, ...(values || {})}
    const confirmedNow = current[keystore.ConfirmSetting] !== false
    const confirmedAfter = requested[keystore.ConfirmSetting] !== false
    const thresholdNow = current[keystore.ThresholdSetting] || 0
    const thresholdAfter = requested[keystore.ThresholdSetting] || 0
    // A wallet already sending silently has nothing left to loosen; enabling
    // confirmation, or lowering how much may go unseen, only tightens.
    const loosens = confirmedNow &&
        (!confirmedAfter || (thresholdAfter > thresholdNow))
    if (!loosens) {
        return
    }
    const asking = !confirmedAfter
        ? {
            message: "Let this wallet send without asking?",
            detail: "This wallet has no password. With confirmation off, anything " +
                "running in the wallet window can send coins with no window like " +
                "this appearing first. You can turn it back on in Settings.",
        }
        : {
            message: "Let up to " + thresholdAfter.toLocaleString("en-US") +
                " satoshis leave without asking?",
            detail: "Sends will go through with nothing shown until they add up " +
                "to that amount. Token sends are always confirmed.",
        }
    const {response} = await dialog.showMessageBox(GetWindow(winId), {
        type: "warning",
        buttons: ["Cancel", "Allow"],
        defaultId: 0,
        cancelId: 0,
        title: "Spend confirmation",
        ...asking,
    })
    if (response !== 1) {
        throw new Error("not allowed in the confirmation dialog")
    }
}

// Asks the person at the machine whether a passwordless wallet may import a
// private key, in the same native dialog the settings path uses - drawn by
// main, modal to the asking window, impossible for the page to cover or
// answer. Importing is a rare, deliberate act, so the friction lands on
// nobody's routine. Declining throws, so nothing is written.
const confirmKeyImport = async (winId) => {
    const {response} = await dialog.showMessageBox(GetWindow(winId), {
        type: "warning",
        buttons: ["Cancel", "Import"],
        defaultId: 0,
        cancelId: 0,
        title: "Key import",
        message: "Import a private key into this wallet?",
        detail: "This wallet has no password. An imported key adds its address " +
            "to what this wallet treats as its own, so coins sent there count " +
            "as staying in the wallet. If you didn't just choose to import a " +
            "key, cancel.",
    })
    if (response !== 1) {
        throw new Error("not allowed in the confirmation dialog")
    }
}

// The removal mirror of confirmKeyImport: on a passwordless wallet, forgetting
// a key is asked of the person at the machine, in the same dialog main draws
// for the import. Losing a key is not the theft the import gate closes, but a
// wallet whose owner kept no backup loses the coins at that address with it.
// Callers judge whether the gate applies against state captured before asking,
// and bind the write to that same capture: the dialog waits on a person, and
// nothing suspends the renderer while it waits - it could open a different
// wallet on the same window, and an approval must not carry over to it.
const confirmKeyRemoval = async (winId) => {
    const {response} = await dialog.showMessageBox(GetWindow(winId), {
        type: "warning",
        buttons: ["Cancel", "Remove"],
        defaultId: 0,
        cancelId: 0,
        title: "Key removal",
        message: "Remove a private key from this wallet?",
        detail: "This wallet has no password. The key and the address it " +
            "unlocks are forgotten, and without a backup of the key the " +
            "coins at that address cannot be spent. If you didn't just " +
            "choose to remove a key, cancel.",
    })
    if (response !== 1) {
        throw new Error("not allowed in the confirmation dialog")
    }
}

// Puts a person in front of a passwordless wallet's secrets. An encrypted
// wallet's exports are gated by the password itself; with no password to know,
// the gate is the same native dialog the settings path uses - drawn by main,
// modal to the asking window, impossible for the page to cover or answer.
// Declining throws, so no secret is read, let alone returned. Judged against
// the state the caller captured and will read from, never re-read: the dialog
// waits on a person while the renderer keeps running, and an approval - or an
// encrypted wallet's dialogless pass-through - must not carry over to a wallet
// swapped onto the window mid-flight.
const confirmPasswordlessExport = async (winId, state, message, detail) => {
    // No wallet is the caller's problem, reported by the read that follows;
    // an encrypted wallet's gate is knowing the password.
    if (!state || state.encrypted) {
        return
    }
    const {response} = await dialog.showMessageBox(GetWindow(winId), {
        type: "warning",
        buttons: ["Cancel", "Reveal"],
        defaultId: 0,
        cancelId: 0,
        title: "Wallet export",
        message: message,
        detail: detail,
    })
    if (response !== 1) {
        throw new Error(WalletErrors.ExportCancelled)
    }
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

// The key for an address, or undefined for one the wallet only watches. The
// same question signing asks, so it is answered by the same code: an imported
// key is matched by the address it unlocks and a derived one is checked against
// the address it is claimed to be, rather than trusted because of where it sits
// in a list.
const walletKey = (wallet, address) => {
    const key = KeyFinder(wallet)(address)
    if (key) {
        return key.toWIF()
    }
    if (WalletAddresses(wallet).includes(address)) {
        return undefined
    }
    throw new Error("address not found in wallet")
}

const exportPrivateKey = async (state, address, password) =>
    walletKey((await readCaptured(state, password)).wallet, address)

// Works entirely from the state its caller captured, never from the window's
// current state: a removal that was confirmed over one wallet must land on
// that wallet's file, whatever the window has been switched to since.
const removePrivateKey = async (state, address, password) => {
    const {wallet: stored} = await keystore.ReadWallet(
        state.filename, state.encrypted ? password : undefined)
    const key = walletKey(stored, address)
    if (!key || !(stored.keys || []).includes(key)) {
        throw new Error("address is not backed by an imported key")
    }
    keystore.ApplyWalletUpdate(stored, "removeKeys", [key])
    keystore.ApplyWalletUpdate(stored, "removeAddresses", forgottenAddresses(stored, [key]))
    await keystore.WriteWallet(
        state.filename, stored, state.encrypted ? password : undefined, state.integrityKey)
    CopyPublicToFileWindows(state.filename, keystore.PublicWallet(stored), false)
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
    if (relayed === undefined) {
        return signHere(e, request)
    }
    // An answer that took a prompt leaves the parent in front, because the
    // prompt was modal to the parent and closing a modal focuses what it was
    // modal to. That is the only displacement to repair, and it is what the
    // parent holding focus now means: an answer straight off the budget asked
    // nobody anything and moved focus nowhere, and wherever the person is
    // looking by then - this window or another program - is where they chose
    // to be. So only a parent in front hands focus back to the window that
    // asked, signed or cancelled alike.
    const asking = GetWindow(e.sender.id)
    if (!parent.isDestroyed() && parent.isFocused() &&
        asking && !asking.isDestroyed()) {
        asking.focus()
    }
    return relayed
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
        // A wallet with no password still puts a person in front of its sends,
        // unless its owner turned that off: a payment leaving the wallet is
        // approved in main's own window, and an approved budget meters the ones
        // after it the way password sessions do. Signing that pays nothing out -
        // a post, a like - carries only its fee and goes through unprompted,
        // which is what keeps the confirmation about money leaving.
        if (!state.encrypted) {
            const wallet = (await readForOperation(winId)).wallet
            if (!confirmsSends(state.wallet)) {
                return {ok: true, value: await sign({
                    wallet,
                    confirmSpend: async () => true,
                })}
            }
            if (state.session) {
                try {
                    const value = await sign({
                        wallet,
                        metered: true,
                        confirmSpend: async () => true,
                    })
                    chargeSession(winId, value.outgoing)
                    return {ok: true, value}
                } catch (error) {
                    if (error.message !== WalletErrors.PasswordRequired) {
                        throw error
                    }
                    // Over the approved budget. Nothing signed, nobody asked
                    // yet, so fall through and ask properly.
                }
            }
            return await approvedSign(winId, sign, wallet)
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

// A passwordless wallet's spend, put in front of the person at the machine.
// The window opens only when a payment actually leaves the wallet, from inside
// the signer's confirmation hook - so what it shows is what the keys establish,
// not a preview to reconcile later, and fee-only signing never opens it.
//
// An approval is also what starts the budget, when the owner has set one: the
// fresh session opens here and nowhere else, so a renderer cannot restart it by
// unlocking again or rewriting settings - the only way to more silent budget is
// another person-approved spend. A sign that asked nobody (cancelled, or
// fee-only) starts nothing.
const approvedSign = async (winId, sign, wallet) => {
    let prompt
    let approved = false
    try {
        const value = await sign({
            wallet,
            confirmSpend: async (actual) => {
                prompt = await OpenSpendPrompt(GetWindow(winId))
                approved = await prompt.approve(actual)
                return approved
            },
        })
        const current = GetWallet(winId)
        if (approved && current && spendThreshold(current.wallet)) {
            rememberWallet(winId, {session: {spent: 0}})
        }
        return {ok: true, value}
    } finally {
        if (prompt) {
            prompt.close()
        }
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
    // Each export captures the window's state once: the gate judges that
    // capture and the secret is read from it, the same binding the key
    // removal below holds to.
    ipcMain.handle(Handlers.ExportSeed, async (e, password) =>
        operationResult(async () => {
            const state = GetWallet(e.sender.id)
            await confirmPasswordlessExport(e.sender.id, state,
                "Reveal this wallet's seed phrase?",
                "This wallet has no password. The seed phrase is the whole " +
                "wallet: anyone who reads it can take everything it holds, " +
                "now or on any later day.")
            return (await readCaptured(state, password)).wallet.seed
        }))
    ipcMain.handle(Handlers.ExportPrivateKey, async (e, address, password) =>
        operationResult(async () => {
            const state = GetWallet(e.sender.id)
            await confirmPasswordlessExport(e.sender.id, state,
                "Reveal the private key for this address?",
                "This wallet has no password. Anyone who reads the key can " +
                "spend everything the address holds.")
            return exportPrivateKey(state, address, password)
        }))
    ipcMain.handle(Handlers.RemovePrivateKey, async (e, address, password) =>
        operationResult(async () => {
            // The window's state, captured once: the gate judges it, and the
            // removal is bound to it - never re-read after the dialog, where
            // a renderer could have switched the window to another wallet.
            // Asked before the file's lock is taken: the dialog waits on a
            // person, and holding the lock across that wait would block every
            // update queued behind it.
            const state = GetWallet(e.sender.id)
            if (state && !state.encrypted) {
                await confirmKeyRemoval(e.sender.id)
            }
            return keystore.WithWalletLock(state.filename,
                () => removePrivateKey(state, address, password))
        }))
    ipcMain.handle(Handlers.CheckWalletFile, async (e, walletName) =>
        operationResult(() => keystore.WalletFileState(e.sender.id, walletName)))
    ipcMain.handle(Handlers.GetExistingWalletFiles, async () => keystore.ListWalletFiles())
    // These two answer in their own shape - a session key beside the ok, the
    // named wallet that is in the way - so only the failure needs wrapping.
    ipcMain.handle(Handlers.UnlockWallet, async (e, walletName, password) =>
        unlockWallet(e.sender.id, walletName, password).catch(asError))
    // The creation flow's seed, kept on this side for its whole life: the
    // renderer asks for words to display, offers a typed phrase for checking,
    // and learns only whether it matched.
    ipcMain.handle(Handlers.GenerateSeed, async (e) => pendingSeed.Generate(e.sender.id))
    ipcMain.handle(Handlers.ImportSeed, async (e, phrase) => pendingSeed.Import(e.sender.id, phrase))
    ipcMain.handle(Handlers.ConfirmSeed, async (e, typed) => pendingSeed.Confirm(e.sender.id, typed))
    ipcMain.handle(Handlers.CreateWallet, async (e, walletName, useSeed, keyList, addressList, password) =>
        createWallet(e.sender.id, walletName, useSeed, keyList, addressList, password).catch(asError))
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
