const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const GetKeys = (seedPhrase) => {
    let keyList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = fromSeed(seed)
        for (let i = 0; i < 20; i++) {
            const child = node.derivePath("m/44'/0'/0'/0/" + i)
            keyList.push(child.toWIF())
        }
    }
    return keyList
}

export default GetKeys
