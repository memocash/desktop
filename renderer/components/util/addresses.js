const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

const GetAddresses = async (seedPhrase, keyList) => {
    return new Promise(async (resolve, reject) => {
        let addressList = []
        if (seedPhrase && seedPhrase.length) {
            console.log("Starting address worker")
            let w = new Worker("address_worker.js", {type: "module"})
            w.onmessage = (e) => {
                console.log("w.onmessage", e.data)
                addressList.push(e.data)
                if (addressList.length === 20) {
                    resolve(addressList)
                }
            }
            w.postMessage(seedPhrase)
        } else if (keyList && keyList.length) {
            for (let i = 0; i < keyList.length; i++) {
                addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
            }
            resolve(addressList)
        }
    })
}

export default GetAddresses
