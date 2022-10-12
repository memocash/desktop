import * as path from "path";

const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const GetAddresses = (seedPhrase, keyList) => {
    let addressList = []
    if (seedPhrase && seedPhrase.length) {
        window.electron.getAddresses(seedPhrase)
    }
    if (keyList && keyList.length) {
        for (let i = 0; i < keyList.length; i++) {
            addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
        }
    }
    return addressList
}

export default GetAddresses
