import {useEffect, useState} from "react"
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from 'bip32';
import {ECPair} from '@bitcoin-dot-com/bitcoincashjs2-lib';

const WalletLoaded = () => {
    const [walletDate, setWalletDate] = useState("")
    const [seedPhrase, setSeedPhrase] = useState("")
    const [addresses, setAddresses] = useState([])

    useEffect(async () => {
        const wallet = await window.electron.getWallet()
        setWalletDate(wallet.time)
        setSeedPhrase(wallet.seed)
        determineAndSetAddress(wallet.seed)
        window.electron.walletLoaded()
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
        loadBalance(addressList[0])
    }

    const loadBalance = (address) => {
        const query = `
    query ($address: String!) {
        address(address: $address) {
            address
            balance
        }
    }
    `
        window.electron.graphQL(query, {
            address: address,
        }).then(data => {
            console.log(data)
        }).catch(err => {
            console.log(err)
        })
    }

    return (
        <div>
            <p>Wallet date: {walletDate}</p>
            <p>Wallet seed phrase: {seedPhrase}</p>
            <div>Addresses: <pre>{addresses.map((address, i) => {
                return (
                    <p key={i}>{i}: {address}</p>
                )
            })}</pre></div>
        </div>
    )
}

export default WalletLoaded
