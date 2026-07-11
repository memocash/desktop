const {mnemonicToSeedSync} = require("bip39");
const {BIP32Factory} = require("bip32");
import * as ecc from "tiny-secp256k1";
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const bip32 = BIP32Factory(ecc)

const GetAddresses = (seedPhrase, keyList) => {
    let addressList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = bip32.fromSeed(seed)
        for (let i = 0; i < 20; i++) {
            const child = node.derivePath("m/44'/0'/0'/0/" + i)
            addressList.push(ECPair.fromWIF(child.toWIF()).getAddress())
        }
    }
    if (keyList && keyList.length) {
        for (let i = 0; i < keyList.length; i++) {
            addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
        }
    }
    return addressList
}
const GetChangeAddresses = (seedPhrase) => {
    let changeList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = bip32.fromSeed(seed)
        for (let i = 0; i < 20; i++) {
            const change = node.derivePath("m/44'/0'/0'/1/" + i)
            changeList.push(ECPair.fromWIF(change.toWIF()).getAddress())
        }
    }
    return changeList
}

export {GetAddresses, GetChangeAddresses}
