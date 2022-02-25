import {useEffect} from "react";
import GetWallet from "../util/wallet";

const Update = ({setConnected}) => {
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        let data
        try {
            data = await loadOutputs(wallet.addresses)
        } catch (e) {
            setConnected(false)
            console.log("Error connecting to index server")
            console.log(e)
            return
        }
        let txs = []
        for (let i = 0; i < data.addresses.length; i++) {
            if (data.addresses[i].outputs == null) {
                console.log("ERROR: null outputs for address: " + data.addresses[i].address)
                console.log(data.addresses[i])
                continue
            }
            for (let j = 0; j < data.addresses[i].outputs.length; j++) {
                txs.push(data.addresses[i].outputs[j].tx)
            }
        }
        await window.electron.saveTransactions(txs)
        setConnected(true)
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
                tx {
                    hash
                    seen
                    inputs {
                        index
                        prev_hash
                        prev_index
                    }
                    outputs {
                        index
                        amount
                        lock {
                            address
                        }
                    }
                    blocks {
                        hash
                        timestamp
                        height
                    }
                }
            }
        }
    }
    `
        let data = await window.electron.graphQL(query, {
            addresses: addresses,
        })
        return data.data
    }
    return (
        <div>
        </div>
    )
}

export default Update
