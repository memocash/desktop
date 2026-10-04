const {ipcRenderer} = require("electron");
const {Handlers, Listeners} = require("../common/util/handlers");
const {WalletErrors} = require("../common/util/errors");

// Nothing here touches the filesystem or a cipher. Each call names an operation
// and main decides whether to perform it - see main/app/keystore.js. Nothing
// here unlocks or creates a wallet either: that is the load page's preload
// (load.js), in a window of its own, and this window was opened by main with
// the wallet already in it.
//
// The session key lives here and nowhere else on this side. Main holds the
// password sealed under it and neither half is a password alone, so a spend
// needs both; keeping the key in the preload rather than handing it to the page
// means script in the page - or anything that got itself into the renderer
// bundle - can ask for a spend within the budget but cannot read the key or take
// it anywhere. It lasts as long as the document does: a reload takes it with it,
// and main's half then opens for nobody, so the next spend asks for the password.
let sessionKey

// The key to the session unlocking opened arrives from main once this
// preload exists to hold it - main opened this window for the wallet, and
// sends the key here rather than to the window that typed the password.
// Registered here, not on the bridge, so the page can neither receive it nor
// hand one in.
ipcRenderer.on(Listeners.SessionKey, (e, key) => {
    sessionKey = key
})

// Strips the session key out of a main-process reply, keeping it on this side of
// the context bridge. A reply with no key leaves the current one alone.
const keepSessionKey = ({sessionKey: key, ...rest}) => {
    if (key) {
        sessionKey = key
    }
    return rest
}
// Setting a spend budget opens one, so these replies carry a session key like
// unlocking does. Every other update replies without one and leaves the current
// key alone.
const updateWallet = (op) => async (values, password) =>
    keepSessionKey(await ipcRenderer.invoke(Handlers.UpdateWallet, op, values, password))

// Main asks this window to make a spend on behalf of a preview window it opened,
// which has no key of its own. It is the same call this window makes for itself,
// on the same key and against the same budget - only the result travels back, so
// the key never leaves this preload. Registered here rather than on the bridge,
// where the page could reach it.
ipcRenderer.on(Listeners.SignOnSession, async (e, {id, request}) => {
    let result
    try {
        result = keepSessionKey(
            await ipcRenderer.invoke(Handlers.SignTransaction, request, sessionKey))
    } catch (error) {
        // Whatever went wrong, the window waiting on this is waiting on a person
        // and has no other way to find out. It gets an answer.
        result = {error: error && error.message ? error.message : String(error)}
    }
    ipcRenderer.send(Handlers.SignOnSessionResult, {id, result})
})

module.exports = {
    addAddresses: updateWallet("addAddresses"),
    removeAddresses: updateWallet("removeAddresses"),
    addKeys: updateWallet("addKeys"),
    removeKeys: updateWallet("removeKeys"),
    changeSettings: updateWallet("changeSettings"),
    getWalletInfo: async (addresses) => ipcRenderer.invoke(Handlers.GetWalletInfo, addresses),
    getWallet: async () => ipcRenderer.invoke(Handlers.GetWallet),
    authenticateWallet: async (password) => ipcRenderer.invoke(Handlers.AuthenticateWallet, password),
    exportSeed: async (password) => ipcRenderer.invoke(Handlers.ExportSeed, password),
    exportPrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.ExportPrivateKey, address, password),
    removePrivateKey: async (address, password) =>
        ipcRenderer.invoke(Handlers.RemovePrivateKey, address, password),
    getWalletFileInfo: async () => ipcRenderer.invoke(Handlers.GetWalletFileInfo),
    walletLoaded: () => ipcRenderer.send(Handlers.WalletLoaded),
    // No password crosses from the page: main signs on the session if the budget
    // covers it, and otherwise asks in a window of its own. What this offers is a
    // key it cannot read, and what it learns is whether that was enough.
    //
    // A preview window's preload never had a key - the key belongs to the
    // document that unlocked the wallet, and that is a different one - so a spend
    // it cannot authorise is offered to main to carry to the window that can.
    signTransaction: async (request) => {
        const result = keepSessionKey(
            await ipcRenderer.invoke(Handlers.SignTransaction, request, sessionKey))
        if (result.error !== WalletErrors.PasswordRequired) {
            return result
        }
        // PasswordRequired only ever means "relay": main answers it from exactly
        // one place, a transaction window whose spend it could not put on a
        // session of its own. Holding a key here is no reason not to - a key
        // whose session has been spent since it was handed over opens nothing,
        // and refusing to relay on its account left the window unable to send at
        // all. A parent that cannot answer sends this back to main's own window,
        // which renews the session on the password typed there. That key belongs
        // on this side of the bridge like every other one.
        return keepSessionKey(await ipcRenderer.invoke(Handlers.SignOnParentSession, request))
    },
    getWindowNetwork: async () => await ipcRenderer.invoke(Handlers.GetWindowNetwork),
}
