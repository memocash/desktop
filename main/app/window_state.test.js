const test = require("node:test")
const assert = require("node:assert")
const {
    AddTxWindow,
    CopyWalletToTxWindows,
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

// A transaction window is handed the parent's wallet when it opens and nothing
// updated it afterwards, so a spend budget the owner revoked stayed live in that
// window and it would seal a session against a policy already withdrawn.
test("a wallet change reaches the transaction windows opened from that window", () => {
    const wallet = (threshold) => ({settings: {PasswordThreshold: threshold}})
    open(10, {filename: "wallet", wallet: wallet(0), session: {envelope: "parent"}})
    for (const child of [11, 12]) {
        open(child, {filename: "wallet", wallet: wallet(0)})
        AddTxWindow(10, child, {id: child})
    }

    assert.deepEqual(CopyWalletToTxWindows(10, wallet(50000)), [11, 12])
    assert.equal(GetWallet(11).wallet.settings.PasswordThreshold, 50000)
    assert.equal(GetWallet(12).wallet.settings.PasswordThreshold, 50000)
    // Revoking has to arrive the same way, which is the direction that matters.
    CopyWalletToTxWindows(10, wallet(0))
    assert.equal(GetWallet(11).wallet.settings.PasswordThreshold, 0)

    // Only the wallet travels. A session sealed in the parent opens for nobody in
    // a child, whose preload never held the key, so it must not be copied there.
    assert.equal(GetWallet(11).session, undefined)
    assert.equal(GetWallet(10).session.envelope, "parent")

    ForgetWindow(11, 10)
    ForgetWindow(12, 10)
    ForgetWindow(10)
})

test("a wallet change stops at a window that is closed or holds another wallet", () => {
    open(20, {filename: "wallet", wallet: {settings: {}}})
    open(21, {filename: "other", wallet: {settings: {}}})
    open(22, {filename: "wallet", wallet: {settings: {}}})
    for (const child of [21, 22]) {
        AddTxWindow(20, child, {id: child})
    }
    // A window on a different file would be shown metadata belonging to a wallet
    // whose path and integrity key it does not hold.
    assert.deepEqual(CopyWalletToTxWindows(20, {settings: {PasswordThreshold: 7}}), [22])
    assert.equal(GetWallet(21).wallet.settings.PasswordThreshold, undefined)

    // And a window whose contents have gone keeps nothing put back into it.
    ForgetWindow(22, 20)
    assert.deepEqual(CopyWalletToTxWindows(20, {settings: {PasswordThreshold: 9}}), [])
    assert.equal(GetWallet(22), undefined)

    // A parent with no wallet has nothing to hand on.
    assert.deepEqual(CopyWalletToTxWindows(999, {settings: {}}), [])

    ForgetWindow(21, 20)
    ForgetWindow(20)
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
