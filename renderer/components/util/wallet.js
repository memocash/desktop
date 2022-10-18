import GetAddresses from "./addresses";
import GetKeys from "./keys";

const GetWallet = async () => {
    let wallet = await window.electron.getWallet()
    if(wallet.seed && wallet.seed.length && (!wallet.keys || !wallet.keys.length)){
        const keyList = GetKeys(wallet.seed)
        await window.electron.addKeys(keyList)
        wallet = await window.electron.getWallet()
    }
    if (!wallet.addresses || !wallet.addresses.length) {
        const addressList = await GetAddresses(wallet.seed, wallet.keys)
        await window.electron.addAddresses(addressList)
        wallet = await window.electron.getWallet()
    }
    return wallet
}

export default GetWallet
