const {mnemonicToSeedSync} = require("bip39")
const bip32 = require("../common/bitcoin/bip32")
const {ECPair} = require("../common/bitcoin/ecpair")

const AddressCount = 20
const DerivationVersion = 1

// The accounts this wallet derives from, named once so the signer and the
// derivation cannot disagree about where a wallet's addresses come from.
const AccountPath = {
    bch: "m/44'/0'/0'",
    slp: "m/44'/245'/0'",
}

const addressOf = (node) => ECPair.fromPublicKeyBuffer(Buffer.from(node.publicKey)).getAddress()

const deriveBranch = (account, branch, count = AddressCount, includeKeys = false) => {
    const addresses = []
    const keys = []
    for (let i = 0; i < count; i++) {
        const child = account.derive(branch).derive(i)
        addresses.push(addressOf(child))
        if (includeKeys) keys.push(child.toWIF())
    }
    return {addresses, keys}
}

const derivePublicWallet = (derivation) => {
    if (!derivation || derivation.version !== DerivationVersion ||
        !derivation.accounts || !derivation.accounts.bch || !derivation.accounts.slp) {
        throw new Error("unsupported wallet derivation metadata")
    }
    const count = derivation.addressCount
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
        throw new Error("unsupported wallet derivation address count")
    }
    const bch = bip32.fromBase58(derivation.accounts.bch)
    const slp = bip32.fromBase58(derivation.accounts.slp)
    if (!bch.isNeutered() || !slp.isNeutered()) {
        throw new Error("wallet derivation metadata must contain public keys")
    }
    return {
        addresses: deriveBranch(bch, 0, count).addresses,
        changeList: deriveBranch(bch, 1, count).addresses,
        slpList: deriveBranch(slp, 0, count).addresses,
    }
}

// The address an imported key unlocks, derived from the key itself. The renderer
// used to work these out and send them alongside the keys, which meant trusting
// it to say what a key it had just handed over actually controls.
const addressesForKeys = (keys) => keys.map((key) => {
    try {
        return ECPair.fromWIF(key).getAddress()
    } catch (e) {
        throw new Error("not a valid private key")
    }
})

const derivePrivateWallet = (seedPhrase, keyList = []) => {
    const keys = []
    const addresses = []
    const changeList = []
    const slpList = []
    let derivation

    if (seedPhrase && seedPhrase.length) {
        const root = bip32.fromSeed(mnemonicToSeedSync(seedPhrase))
        const bch = root.derivePath(AccountPath.bch)
        const slp = root.derivePath(AccountPath.slp)
        // Only the receive branch needs private keys (legacy-WIF recognition);
        // change and token keys would only ride the worker message to no reader.
        const receive = deriveBranch(bch, 0, AddressCount, true)
        const change = deriveBranch(bch, 1)
        const token = deriveBranch(slp, 0)
        keys.push(...receive.keys)
        addresses.push(...receive.addresses)
        changeList.push(...change.addresses)
        slpList.push(...token.addresses)
        derivation = {
            version: DerivationVersion,
            addressCount: AddressCount,
            accounts: {
                bch: bch.neutered().toBase58(),
                slp: slp.neutered().toBase58(),
            },
        }
    }

    for (const key of keyList || []) {
        addresses.push(ECPair.fromWIF(key).getAddress())
    }
    return {keys, addresses, changeList, slpList, derivation}
}

module.exports = {
    AccountPath,
    AddressCount,
    Bip32: bip32,
    addressesForKeys,
    derivePrivateWallet,
    derivePublicWallet,
}
