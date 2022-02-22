import {useEffect} from "react";

const Update = ({setConnected}) => {
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await window.electron.getWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        let data
        try {
            data = await loadOutputs(wallet.addresses)
        } catch(e) {
            setConnected(false)
            console.log("Error connecting to index server")
            console.log(e)
            return
        }
        console.log(data)
        let txs = []
        for (let i = 0; i < data.addresses.length; i++) {
            if (data.addresses[i].outputs == null) {
                console.log("null outputs for address: " + data.addresses[i].address)
                console.log(data.addresses[i])
                continue
            }
            for (let j = 0; j < data.addresses[i].outputs.length; j++) {
                console.log(data.addresses[i].outputs[j].tx)
                txs.push(data.addresses[i].outputs[j].tx)
            }
        }
        console.log(txs)
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
