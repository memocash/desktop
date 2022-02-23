import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";

const Addresses = () => {
    const [addresses, setAddresses] = useState([])

    useEffect(async () => {
        window.electron.walletLoaded()
        const wallet = await GetWallet()
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
        console.log(data)
        return data.data.addresses
    }

    return (
        <div>
            <pre>
                {(!addresses || !addresses.length) ? "Generating addresses, please wait..." : null}
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
