// What main knows about each open window, kept apart from the code that creates
// windows so it can be reasoned about - and tested - without Electron. None of
// this is a private key, but it is not nothing either: the wallet's public
// metadata, the key that authenticates that metadata on disk, and the sealed
// password behind a spend budget all live here, so it matters that a closed
// window leaves nothing behind.

const wallets = {}
const storage = {}
const windows = {}
const menus = {}
const networkOptions = {}
// Transaction windows opened from a wallet window, kept under the id of the
// window they came from.
const txWindows = {}
const txWindowIds = new Set()

const GetMenu = (winId) => menus[winId]
const GetNetworkOption = (winId) => networkOptions[winId]
const GetStorage = (winId) => storage[winId]
const GetWallet = (winId) => wallets[winId]
const GetWindow = (winId) => windows[winId]
// Whether a window is still open, for work that outlives the window that asked
// for it: an update queued behind the wallet's lock can finish after its window
// has gone, and it must not put that window's wallet back into the map.
const IsOpen = (winId) => windows[winId] !== undefined
// True once a wallet has been loaded in the window, which is also when it starts
// rendering the modal viewer. Transaction windows inherit the parent's wallet
// but have no modals, so they are excluded.
const IsWalletWindow = (winId) => wallets[winId] !== undefined && !txWindowIds.has(winId)
const SetMenu = (winId, menu) => menus[winId] = menu
const SetNetworkOption = (winId, option) => networkOptions[winId] = option
const SetStorage = (winId, data) => storage[winId] = data
const SetWallet = (winId, wallet) => wallets[winId] = wallet
const SetWindow = (winId, win) => windows[winId] = win

const AddTxWindow = (parentId, winId, win) => {
    if (txWindows[parentId] === undefined) {
        txWindows[parentId] = []
    }
    txWindows[parentId].push({winId, win})
    txWindowIds.add(winId)
}

// The transaction windows opened from a wallet window. They are handed a copy of
// the parent's wallet state when they open, so whatever changes it afterwards
// has to find them again.
const TxWindowIds = (parentId) => (txWindows[parentId] || []).map(({winId}) => winId)

// Puts the parent's wallet in front of the transaction windows it opened, which
// would otherwise go on showing it as it stood when each of them opened. The
// settings are the part that matters: they say how much may leave the wallet
// without the password, and a window reading a stale copy would seal a session
// against a budget its owner has already withdrawn. The address lists matter
// too, since a preview decides from them which outputs are the wallet's own.
//
// Only the wallet travels. The session does not: each window's key lives in its
// own preload, so an envelope sealed for one window opens for nobody in another.
// And only onto a child still open on the same file, so wallet metadata can
// never be put in front of a window holding a different wallet's path and key.
// Returns the windows it reached, so a test can see it rather than take it on
// trust.
const CopyWalletToTxWindows = (parentId, wallet) => {
    const parent = wallets[parentId]
    if (!parent) {
        return []
    }
    return TxWindowIds(parentId).filter((winId) => {
        const child = wallets[winId]
        if (windows[winId] === undefined || !child || child.filename !== parent.filename) {
            return false
        }
        wallets[winId] = {...child, wallet}
        return true
    })
}

// The wallet window a transaction window was opened from, or undefined for a
// window that is not a transaction window. A preview cannot spend on the budget
// itself - the session key stays in the preload of the window that unlocked the
// wallet - so a spend it asks for is carried back to the window that holds it.
const TxWindowParent = (winId) => {
    const found = Object.entries(txWindows).find(([, children]) =>
        children.some((child) => child.winId === winId))
    return found ? Number(found[0]) : undefined
}

// Everything a window put here goes when the window does. A transaction window
// also has to come out of the list held under the window it was opened from,
// which is not keyed by its own id: without that, opening and closing previews
// would pile up closed windows under the parent for as long as the parent lived.
const ForgetWindow = (winId, parentId) => {
    delete wallets[winId]
    delete storage[winId]
    delete menus[winId]
    delete networkOptions[winId]
    delete windows[winId]
    delete txWindows[winId]
    txWindowIds.delete(winId)
    if (parentId === undefined || txWindows[parentId] === undefined) {
        return
    }
    txWindows[parentId] = txWindows[parentId].filter((child) => child.winId !== winId)
    if (!txWindows[parentId].length) {
        delete txWindows[parentId]
    }
}

// For tests, which need to see that nothing is left rather than take it on
// trust.
const HeldWindowIds = () => ({
    wallets: Object.keys(wallets),
    storage: Object.keys(storage),
    menus: Object.keys(menus),
    networkOptions: Object.keys(networkOptions),
    windows: Object.keys(windows),
    txWindows: Object.keys(txWindows),
    txWindowIds: [...txWindowIds].map(String),
})

module.exports = {
    AddTxWindow,
    CopyWalletToTxWindows,
    ForgetWindow,
    GetMenu,
    GetNetworkOption,
    GetStorage,
    GetWallet,
    GetWindow,
    HeldWindowIds,
    IsOpen,
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    SetWindow,
    TxWindowIds,
    TxWindowParent,
}
