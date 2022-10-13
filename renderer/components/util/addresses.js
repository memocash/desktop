const ECPair = require("ecpair").ECPairFactory(require("tiny-secp256k1"));

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
