import {useEffect, useState} from "react";
import GetAddresses from "../util/addresses";

const Addresses = () => {
    const [addresses, setAddresses] = useState([])

    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await window.electron.getWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            const addressList = GetAddresses(wallet.seed, wallet.keys)
            await window.electron.addAddresses(addressList)
            wallet = await window.electron.getWallet()
        }
        const balances = await loadBalance(wallet.addresses)
        setAddresses(balances)
    }, [])

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
                {(!addresses || !addresses.length) ? "No addresses" : null}
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
