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
        let addresses = new Array(wallet.addresses.length)
        for (let i = 0; i < wallet.addresses.length; i++) {
            addresses[i] = {
                address: wallet.addresses[i],
                hash: "", index: 0, height: 0,
            }
        }
        for (let i = 0; i < 5 && addresses.length; i++) {
            let data
            try {
                data = await loadOutputs({addresses})
                console.log(data)
            } catch (e) {
                setConnected(false)
                console.log("Error connecting to index server")
                console.log(e)
                return
            }
            let txs = []
            for (let name in data) {
                if (data[name].outputs == null) {
                    console.log("ERROR: null outputs for address: " + data[name].address)
                    console.log(data[name])
                    continue
                }
                let maxHash, maxHashIndex, maxHeight
                for (let j = 0; j < data[name].outputs.length; j++) {
                    txs.push(data[name].outputs[j].tx)
                    if (maxHash === undefined || data[name].outputs[j].tx.hash > maxHash) {
                        maxHash = data[name].outputs[j].tx.hash
                        maxHashIndex = data[name].outputs[j].index
                    }
                    if (data[name].outputs[j].tx.blocks && (maxHeight === undefined ||
                        data[name].outputs[j].tx.blocks[0].height > maxHeight)) {
                        maxHeight = data[name].outputs[j].tx.blocks[0].height
                    }
                }
                for (let i = 0; i < addresses.length; i++) {
                    if (data[name].address !== addresses[i].address) {
                        continue
                    }
                    if (data[name].outputs.length < 1000) {
                        addresses.splice(i, 1)
                        i--
                        continue
                    }
                    addresses[i].hash = maxHash
                    addresses[i].index = maxHashIndex
                    addresses[i].height = maxHeight
                    console.log("looping address: " + addresses[i].address + ", height: " + addresses[i].height,
                        ", hashIndex: " + addresses[i].hash + ":" + addresses[i].index)
                }
            }
            await window.electron.saveTransactions(txs)
        }
        setConnected(true)
    }, [])
    const loadOutputs = async ({addresses}) => {
        let variables = {}
        let paramsStrings = []
        let subQueries = []
        for (let i = 0; i < addresses.length; i++) {
            paramsStrings.push(`$address${i}: String!, $start${i}: HashIndex, $height${i}: Int`)
            variables["address" + i] = addresses[i].address
            variables["start" + i] = JSON.stringify({
                hash: addresses[i].hash,
                index: addresses[i].index,
            })
            variables["height" + i] = addresses[i].height
            subQueries.push(`
        address${i}: address(address: $address${i}) {
            address
            outputs(start: $start${i}, height: $height${i}) {
                hash
                index
                amount
                tx {
                    hash
                    seen
                    raw
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
        `)
        }
        const query = `
    query (${paramsStrings.join(", ")}) {
        ${subQueries.join("\n")}
    }
    `
        let data = await window.electron.graphQL(query, variables)
        return data.data
    }
    return (
        <div>
        </div>
    )
}

export default Update
