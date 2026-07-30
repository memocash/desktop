const GetWallet = async () => {
    let wallet = await window.electron.getWallet()
    if(!wallet.settings){
        await window.electron.changeSettings({})
        wallet = await window.electron.getWallet()
    }
    return wallet
}

export default GetWallet
