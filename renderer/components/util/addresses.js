const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");

// Converts a list of WIF keys to their addresses. Seed-based HD derivation now
// happens off-thread in the main process (see window.electron.generateWallet);
// this remains for the key-import modals, which only ever convert explicit keys.
const GetAddresses = (keyList) => {
    let addressList = []
    if (keyList && keyList.length) {
        for (let i = 0; i < keyList.length; i++) {
            addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
        }
    }
    return addressList
}

export {GetAddresses}
