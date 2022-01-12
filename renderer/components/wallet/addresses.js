import {useEffect, useState} from "react";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";

const Addresses = () => {
    const [addresses, setAddresses] = useState([])

    useEffect(async () => {
        window.electron.walletLoaded()
        const wallet = await window.electron.getWallet()
        await determineAndSetAddress(wallet)
    }, [])

    const determineAndSetAddress = async (wallet) => {
        let addressList = []
        if (wallet.seed && wallet.seed.length) {
            const seed = mnemonicToSeedSync(wallet.seed);
            const node = fromSeed(seed);
            for (let i = 0; i < 20; i++) {
                const child = node.derivePath("m/44'/0'/0'/0/" + i);
                addressList.push(ECPair.fromWIF(child.toWIF()).getAddress())
            }
        }
        if (wallet.keys && wallet.keys.length) {
            for (let i = 0; i < wallet.keys.length; i++) {
                addressList.push(ECPair.fromWIF(wallet.keys[i]).getAddress())
            }
        }
        const balances = await loadBalance(addressList)
        setAddresses(balances)
    }

    const loadBalance = async (addresses) => {
        const query = `
    query ($addresses: [String!]) {
        addresses(addresses: $addresses) {
            address
            balance
        }
    }
    `
        let data = await window.electron.graphQL(query, {
            addresses: addresses,
        })
        return data.data.addresses
    }

    return (
        <div>
            <pre>
                {addresses.map((address, i) => {
                    return (
                        <p key={i}>{i}: {address.address} - {address.balance}</p>
                    )
                })}
            </pre>
        </div>
    )
}

export default Addresses