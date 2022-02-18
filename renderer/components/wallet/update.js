import {useEffect} from "react";

const Update = () => {
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await window.electron.getWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        const outputs = await loadOutputs(wallet.addresses)
        console.log(outputs)
    }, [])

    const loadOutputs = async (addresses) => {
        const query = `
    query ($addresses: [String!]) {
        addresses(addresses: $addresses) {
            address
            outputs {
                hash
                index
                amount
            }
        }
    }
    `
        let data = await window.electron.graphQL(query, {
            addresses: addresses,
        })
        console.log(data)
        return data.data
    }
    return (
        <div>
        </div>
    )
}

export default Update
