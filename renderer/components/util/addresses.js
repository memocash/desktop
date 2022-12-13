const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const GetAddresses = (seedPhrase, keyList) => {
    let addressList = []
    if (seedPhrase && seedPhrase.length) {
        const seed = mnemonicToSeedSync(seedPhrase)
        const node = fromSeed(seed)
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
        const node = fromSeed(seed)
        for (let i = 0; i < 20; i++) {
            const change = node.derivePath("m/44'/0'/0'/1/" + i)
            changeList.push(ECPair.fromWIF(change.toWIF()).getAddress())
        }
    }
    return changeList
}

export {GetAddresses, GetChangeAddresses}
