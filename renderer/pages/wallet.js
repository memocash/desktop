import {useEffect, useState} from "react"
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from 'bip32';
import {ECPair} from '@bitcoin-dot-com/bitcoincashjs2-lib';

const WalletLoaded = () => {
    const [walletDate, setWalletDate] = useState("")
    const [seedPhrase, setSeedPhrase] = useState("")
    const [addresses, setAddresses] = useState([])

    useEffect(async () => {
        const wallet = await electron.getWallet()
        setWalletDate(wallet.time)
        setSeedPhrase(wallet.seed)
        determineAndSetAddress(wallet.seed)
        electron.walletLoaded()
    }, [])

    const determineAndSetAddress = (mnemonic) => {
        const seed = mnemonicToSeedSync(mnemonic);
        const node = fromSeed(seed);
        let addressList = []
        for (let i = 0; i < 20; i++) {
            const child = node.derivePath("m/44'/0'/0'/0/" + i);
            addressList.push(ECPair.fromWIF(child.toWIF()).getAddress())
        }
        setAddresses(addressList)
    }

    return (
        <div>
            <h1>This is the new wallet loaded page.</h1>
            <p>Wallet date: {walletDate}</p>
            <p>Wallet seed phrase: {seedPhrase}</p>
            <p>Addresses: <pre>{addresses.map((address, i) => {
                return (
                    <p>{i}: {address}</p>
                )
            })}</pre></p>
        </div>
    )
}

export default WalletLoaded
