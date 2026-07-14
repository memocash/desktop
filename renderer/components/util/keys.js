const {mnemonicToSeedSync} = require("bip39");
import bip32 from "./bip32";

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
