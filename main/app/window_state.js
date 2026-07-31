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
// The wallet window each transaction window was opened from, kept under the id
// of the transaction window itself rather than the other way round. A child has
// to go on knowing what it is after its parent closes: transaction windows are
// top-level windows that outlive the window they came from, they have no modal
// viewer, and one that stopped naming a parent would start looking like a wallet
// window that does - which is how the update notice ends up sent somewhere it
// cannot be drawn. A Map so the ids stay numbers and keep their insertion order.
const txParents = new Map()

const GetMenu = (winId) => menus[winId]
const GetNetworkOption = (winId) => networkOptions[winId]
const GetStorage = (winId) => storage[winId]
const GetWallet = (winId) => wallets[winId]
const GetWindow = (winId) => windows[winId]
// True once a wallet has been loaded in the window, which is also when it starts
// rendering the modal viewer. Transaction windows inherit the parent's wallet
// but have no modals, so they are excluded.
const IsWalletWindow = (winId) => wallets[winId] !== undefined && !txParents.has(winId)
const SetMenu = (winId, menu) => menus[winId] = menu
const SetNetworkOption = (winId, option) => networkOptions[winId] = option
const SetStorage = (winId, data) => storage[winId] = data
const SetWallet = (winId, wallet) => wallets[winId] = wallet
const SetWindow = (winId, win) => windows[winId] = win

const AddTxWindow = (parentId, winId) => txParents.set(winId, parentId)

// The transaction windows opened from a wallet window. They are handed a copy of
// the parent's wallet state when they open, so whatever changes it afterwards
// has to find them again.
const TxWindowIds = (parentId) =>
    [...txParents].filter(([, parent]) => parent === parentId).map(([winId]) => winId)

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
// The window named here may already have closed; whoever asks has to allow for
// that, which is why the relay falls back to asking in main's own window.
const TxWindowParent = (winId) => txParents.get(winId)

// Everything a window put here goes when the window does. Keying the parent
// under the child means a transaction window takes its own entry with it, so
// opening and closing previews leaves nothing piled up under the parent and a
// closing parent strands nothing under itself.
const ForgetWindow = (winId) => {
    delete wallets[winId]
    delete storage[winId]
    delete menus[winId]
    delete networkOptions[winId]
    delete windows[winId]
    txParents.delete(winId)
}

// For tests, which need to see that nothing is left rather than take it on
// trust.
const HeldWindowIds = () => ({
    wallets: Object.keys(wallets),
    storage: Object.keys(storage),
    menus: Object.keys(menus),
    networkOptions: Object.keys(networkOptions),
    windows: Object.keys(windows),
    txWindows: [...txParents.keys()].map(String),
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
    IsWalletWindow,
    SetMenu,
    SetNetworkOption,
    SetStorage,
    SetWallet,
    SetWindow,
    TxWindowIds,
    TxWindowParent,
}
