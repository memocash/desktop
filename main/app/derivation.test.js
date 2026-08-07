const assert = require("node:assert/strict")
const test = require("node:test")
const {ECPair} = require("../common/bitcoin/ecpair")
const {
    AddressCount,
    addressesForKeys,
    derivePrivateWallet,
    derivePublicWallet,
} = require("./derivation")
const {normalizeSeedWalletData} = require("./seed_wallet")

const Seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

test("public account keys reproduce every seed-derived address without private keys", () => {
    const privateWallet = derivePrivateWallet(Seed)
    const publicWallet = derivePublicWallet(privateWallet.derivation)

    assert.deepEqual(publicWallet.addresses, privateWallet.addresses)
    assert.deepEqual(publicWallet.changeList, privateWallet.changeList)
    assert.deepEqual(publicWallet.slpList, privateWallet.slpList)
    assert.equal(privateWallet.derivation.accounts.bch.startsWith("xpub"), true)
    assert.equal(privateWallet.derivation.accounts.slp.startsWith("xpub"), true)
    assert.equal(privateWallet.derivation.addressCount, AddressCount)
    assert.equal(JSON.stringify(privateWallet.derivation).includes(privateWallet.keys[0]), false)
})

test("an imported key contributes the address it unlocks", () => {
    const {keys, addresses} = derivePrivateWallet(Seed, [])
    assert.deepEqual(addressesForKeys([keys[3], keys[7]]), [addresses[3], addresses[7]])
    assert.deepEqual(addressesForKeys([]), [])
    // A string that isn't a key can't be stored as one.
    assert.throws(() => addressesForKeys(["not-a-key"]), {message: /not a valid private key/})
})

test("public derivation rejects private account keys and unreasonable counts", () => {
    const derived = derivePrivateWallet(Seed)
    assert.throws(() => derivePublicWallet({
        ...derived.derivation,
        accounts: {...derived.derivation.accounts, bch: "not-an-xpub"},
    }))
    assert.throws(() => derivePublicWallet({
        ...derived.derivation,
        addressCount: 10001,
    }), {message: /address count/})
})

test("seed normalization removes legacy derived WIFs but preserves imported keys and addresses", () => {
    const imported = ECPair.fromPrivateKey(require("node:crypto").randomBytes(32)).toWIF()
    const importedAddress = ECPair.fromWIF(imported).getAddress()
    const derived = derivePrivateWallet(Seed, [imported])
    const publicDerived = derivePublicWallet(derived.derivation)
    const watchAddress = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
    const wallet = {
        seed: Seed,
        keys: [derived.keys[0], imported, derived.keys[7]],
        addresses: [derived.addresses[0], importedAddress, watchAddress],
    }

    const normalized = normalizeSeedWalletData(wallet, derived)

    assert.deepEqual(normalized.keys, [imported])
    assert.deepEqual(normalized.addresses.slice(0, AddressCount), publicDerived.addresses)
    assert.equal(normalized.addresses.includes(importedAddress), true)
    assert.equal(normalized.addresses.includes(watchAddress), true)
    assert.deepEqual(normalized.derivation, derived.derivation)
})
