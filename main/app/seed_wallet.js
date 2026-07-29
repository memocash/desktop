// Removes only the receive keys that can be regenerated from the mnemonic.
// Imported keys and user-added public addresses are intentionally retained.
const normalizeSeedWalletData = (wallet, derived, publicDerived) => {
    const legacyKeys = new Set(derived.keys)
    return {
        ...wallet,
        keys: (wallet.keys || []).filter((key) => !legacyKeys.has(key)),
        addresses: [...new Set([
            ...publicDerived.addresses,
            ...(wallet.addresses || []),
        ])],
        changeList: [...new Set([
            ...publicDerived.changeList,
            ...(wallet.changeList || []),
        ])],
        slpList: [...new Set([
            ...publicDerived.slpList,
            ...(wallet.slpList || []),
        ])],
        derivation: derived.derivation,
    }
}

module.exports = {normalizeSeedWalletData}
