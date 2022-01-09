import {useEffect, useState} from "react"

const WalletLoaded = () => {
    const [walletDate, setWalletDate] = useState("")
    const [seedPhrase, setSeedPhrase] = useState("")

    useEffect(async () => {
        const wallet = await electron.getWallet()
        setWalletDate(wallet.time)
        setSeedPhrase(wallet.seed)
        electron.walletLoaded()
    }, [])

    return (
        <div>
            <h1>This is the new wallet loaded page.</h1>
            <p>Wallet date: {walletDate}</p>
            <p>Wallet seed phrase: {seedPhrase}</p>
        </div>
    )
}

export default WalletLoaded
