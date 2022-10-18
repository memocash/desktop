import * as path from "path";

const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const GetAddresses = async (seedPhrase, keyList) => {
    let addressList = []
    if (seedPhrase && seedPhrase.length) {
        addressList = await window.electron.getAddresses(seedPhrase)
        console.log(addressList)
    }
    if (keyList && keyList.length) {
        for (let i = 0; i < keyList.length; i++) {
            addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
        }
    }
    return addressList
}

export default GetAddresses
