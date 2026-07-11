const {mnemonicToSeedSync} = require("bip39");
const {BIP32Factory} = require("bip32");
import * as ecc from "tiny-secp256k1";

const bip32 = BIP32Factory(ecc)

const GetKeys = (seedPhrase) => {
    let keyList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = bip32.fromSeed(seed)
        for (let i = 0; i < 20; i++) {
            const child = node.derivePath("m/44'/0'/0'/0/" + i)
            keyList.push(child.toWIF())
        }
    }
    return keyList
}

export default GetKeys
