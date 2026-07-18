const GetWallet = async () => {
    let wallet = await window.electron.getWallet()
    if(!wallet.settings){
        await window.electron.changeSettings({})
        wallet = await window.electron.getWallet()
    }
    const needsKeys = wallet.seed && wallet.seed.length && (!wallet.keys || !wallet.keys.length)
    const needsAddresses = !wallet.addresses || !wallet.addresses.length
    const needsChangeList = wallet.seed && wallet.seed.length && (!wallet.changeList || !wallet.changeList.length)
    const needsSlpList = wallet.seed && wallet.seed.length && (!wallet.slpList || !wallet.slpList.length)
    if (needsKeys || needsAddresses || needsChangeList || needsSlpList) {
        // Derivation runs in a worker thread (see main/app/handlers/addressWorker.js)
        // so it doesn't lock the UI. A single call derives keys, addresses, and the
        // change and SLP lists together from the seed.
        const {keys, addresses, changeList, slpList} = await window.electron.generateWallet(wallet.seed, wallet.keys)
        if (needsKeys) {
            await window.electron.addKeys(keys)
            wallet = await window.electron.getWallet()
        }
        if (needsAddresses) {
            await window.electron.addAddresses(addresses)
            wallet = await window.electron.getWallet()
        }
        if (needsChangeList) {
            await window.electron.addChangeList(changeList)
            wallet = await window.electron.getWallet()
        }
        if (needsSlpList) {
            await window.electron.addSlpList(slpList)
            wallet = await window.electron.getWallet()
        }
    }
    if(!wallet.seed || !wallet.seed.length){
        await window.electron.addChangeList([])
        wallet = await window.electron.getWallet()
    }
    return wallet
}

export default GetWallet
