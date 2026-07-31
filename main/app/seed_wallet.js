// Removes only the receive keys that can be regenerated from the mnemonic.
// Imported keys and user-added public addresses are intentionally retained. A
// wallet that already has derivation metadata offers no keys to remove, so this
// leaves its key list alone and only merges the derived addresses in.
const normalizeSeedWalletData = (wallet, derived) => {
    const legacyKeys = new Set(derived.keys)
    return {
        ...wallet,
        keys: (wallet.keys || []).filter((key) => !legacyKeys.has(key)),
        addresses: [...new Set([
            ...derived.addresses,
            ...(wallet.addresses || []),
        ])],
        changeList: [...new Set([
            ...derived.changeList,
            ...(wallet.changeList || []),
        ])],
        slpList: [...new Set([
            ...derived.slpList,
            ...(wallet.slpList || []),
        ])],
        derivation: derived.derivation,
    }
}

module.exports = {normalizeSeedWalletData}
