const test = require("node:test")
const assert = require("node:assert")
const {
    AddTxWindow,
    ForgetWindow,
    GetWallet,
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
} = require("./window_state")

const open = (winId, wallet) => {
    SetWindow(winId, {id: winId})
    SetWallet(winId, wallet)
    SetMenu(winId, {menu: winId})
    SetNetworkOption(winId, {network: winId})
    SetStorage(winId, {tab: "memo"})
}

test("closing a window leaves nothing of it behind", () => {
    open(1, {filename: "wallet", integrityKey: "secret", session: {envelope: {}}})
    assert.equal(IsOpen(1), true)
    assert.equal(IsWalletWindow(1), true)

    ForgetWindow(1)
    assert.equal(IsOpen(1), false)
    assert.equal(IsWalletWindow(1), false)
    assert.equal(GetWallet(1), undefined)
    const held = HeldWindowIds()
    for (const [name, ids] of Object.entries(held)) {
        assert.equal(ids.includes("1"), false, name + " still holds the closed window")
    }
})

test("a transaction window is released by the window it was opened from", () => {
    open(2, {filename: "wallet"})
    for (const child of [3, 4]) {
        open(child, GetWallet(2))
        AddTxWindow(2, child, {id: child})
    }
    assert.deepEqual(TxWindowIds(2), [3, 4])
    // A transaction window is not a wallet window, even though it has a wallet.
    assert.equal(IsWalletWindow(3), false)

    // Closing one has to take it out of the list held under its parent, which is
    // not keyed by its own id.
    ForgetWindow(3, 2)
    assert.deepEqual(TxWindowIds(2), [4])
    assert.equal(HeldWindowIds().txWindowIds.includes("3"), false)

    ForgetWindow(4, 2)
    assert.deepEqual(TxWindowIds(2), [])
    assert.equal(HeldWindowIds().txWindows.includes("2"), false,
        "an empty list should not be kept either")

    ForgetWindow(2)
    assert.deepEqual(HeldWindowIds().windows, [])
})

test("a transaction window names the window that opened it", () => {
    open(5, {filename: "wallet"})
    open(6, GetWallet(5))
    AddTxWindow(5, 6, {id: 6})
    // A spend asked for in the transaction window is carried back to this one,
    // which is the only side holding the key to the session it spends against.
    assert.equal(TxWindowParent(6), 5)
    // A wallet window has no parent, and neither does a window that has gone.
    assert.equal(TxWindowParent(5), undefined)
    ForgetWindow(6, 5)
    assert.equal(TxWindowParent(6), undefined)
    ForgetWindow(5)
})

test("forgetting a window that was never open is not an error", () => {
    ForgetWindow(99)
    ForgetWindow(99, 98)
    assert.equal(IsOpen(99), false)
})
