import GetAddresses from "./addresses";

const GetWallet = async () => {
    let wallet = await window.electron.getWallet()
    if (!wallet.addresses || !wallet.addresses.length) {
        const addressList = GetAddresses(wallet.seed, wallet.keys)
        await window.electron.addAddresses(addressList)
        wallet = await window.electron.getWallet()
    }
    return wallet
}

export default GetWallet
