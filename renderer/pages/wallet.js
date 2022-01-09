import { useEffect, useState } from "react"

const WalletLoaded = () => {
    const [walletDate, setWalletDate] = useState("")
    const [seedPhrase, setSeedPhrase] = useState("")

    useEffect(() => {
        electron.listenAddedWallet((event, walletInfo) => {
            setSeedPhrase(walletInfo.seedPhrase)
        })
        electron.getWalletFromMainProcess()
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
