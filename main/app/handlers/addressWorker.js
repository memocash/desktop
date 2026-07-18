const {parentPort, workerData} = require("worker_threads")
const crypto = require("crypto")

// bitcoincashjs2-lib (via create-hash) requests the legacy 'rmd160' digest alias
// for address hashing. Node's OpenSSL accepts it, but Electron's BoringSSL - which
// backs this worker - only knows 'ripemd160', so getAddress() throws "Digest method
// not supported". Alias it before bitcoincashjs2-lib binds crypto.createHash. In the
// renderer this never surfaced because webpack swaps in create-hash's pure-JS build.
const originalCreateHash = crypto.createHash
crypto.createHash = (algorithm, options) =>
    originalCreateHash.call(crypto, algorithm === "rmd160" ? "ripemd160" : algorithm, options)

const {mnemonicToSeedSync} = require("bip39")
const {BIP32Factory} = require("bip32")
const ecc = require("tiny-secp256k1")
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib")

// bip32 v5 has no bare fromSeed export; it must be built from an ecc
// implementation. In the Node worker context tiny-secp256k1 loads its WASM
// synchronously, so derivation is a plain blocking loop here - which is fine
// because it runs off the main and renderer threads.
const bip32 = BIP32Factory(ecc)

const AddressCount = 20

// Derives the same keys/addresses/change list the renderer used to compute
// inline (see the former GetKeys/GetAddresses/GetChangeAddresses helpers).
// Combined into one pass so a single seed derivation produces everything.
const deriveWallet = (seedPhrase, keyList) => {
    const keys = []
    const addresses = []
    const changeList = []
    const slpList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = bip32.fromSeed(seed)
        for (let i = 0; i < AddressCount; i++) {
            const child = node.derivePath("m/44'/0'/0'/0/" + i)
            keys.push(child.toWIF())
            addresses.push(ECPair.fromWIF(child.toWIF()).getAddress())
        }
        for (let i = 0; i < AddressCount; i++) {
            const change = node.derivePath("m/44'/0'/0'/1/" + i)
            changeList.push(ECPair.fromWIF(change.toWIF()).getAddress())
        }
        // SLP addresses use coin type 245 (the SLP standard derivation path),
        // keeping token outputs separate from regular BCH addresses.
        for (let i = 0; i < AddressCount; i++) {
            const slp = node.derivePath("m/44'/245'/0'/0/" + i)
            slpList.push(ECPair.fromWIF(slp.toWIF()).getAddress())
        }
    }
    if (keyList && keyList.length) {
        for (let i = 0; i < keyList.length; i++) {
            addresses.push(ECPair.fromWIF(keyList[i]).getAddress())
        }
    }
    return {keys, addresses, changeList, slpList}
}

try {
    parentPort.postMessage({result: deriveWallet(workerData.seed, workerData.keys)})
} catch (e) {
    parentPort.postMessage({error: e.message})
}
