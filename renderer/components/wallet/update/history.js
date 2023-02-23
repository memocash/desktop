import {Status} from "../../util/connect"

const UpdateHistory = async ({wallet, setConnected, setLastUpdate}) => {
    let addressList = wallet.addresses.concat(wallet.changeList)
    const recentAddresses = await window.electron.getRecentAddressTransactions(addressList)
    let addresses = new Array(addressList.length)
    for (let i = 0; i < addressList.length; i++) {
        addresses[i] = {
            address: addressList[i],
            hash: "", timestamp: null
        }
        for (let j = 0; j < recentAddresses.length; j++) {
            if (!recentAddresses[j].address === addressList[i]) {
                continue
            }
            addresses[i].timestamp = recentAddresses[j].timestamp - 1
        }
    }
    for (let i = 0; i < 100 && addresses.length; i++) {
        let data
        try {
            data = await loadOutputs({addresses})
        } catch (e) {
            setConnected(Status.Disconnected)
            console.log("Error connecting to index server")
            console.log(e)
            return
        }
        let txs = []
        for (let name in data) {
            if (data[name].txs == null) {
                console.log("ERROR: null outputs for address: " + data[name].address)
                console.log(data[name])
                continue
            }
            let maxHash, maxStart
            for (let j = 0; j < data[name].txs.length; j++) {
                txs.push(data[name].txs[j])
                if (data[name].txs[j].blocks && (maxStart === undefined ||
                    data[name].txs[j].blocks[0].timestamp >= maxStart)) {
                    if (maxStart === undefined || data[name].txs[j].blocks[0].timestamp > maxStart) {
                        maxStart = data[name].txs[j].blocks[0].timestamp
                        maxHash = undefined
                    }
                    if (maxHash === undefined || data[name].txs[j].hash > maxHash) {
                        maxHash = data[name].txs[j].hash
                    }
                }
                for (let h = 0; h < data[name].txs[j].outputs.length; h++) {
                    if (!data[name].txs[j].outputs[h].spends) {
                        continue
                    }
                    for (let k = 0; k < data[name].txs[j].outputs[h].spends.length; k++) {
                        txs.push(data[name].txs[j].outputs[h].spends[k].tx)
                    }
                }
            }
            for (let i = 0; i < addresses.length; i++) {
                if (data[name].address !== addresses[i].address) {
                    continue
                }
                if (data[name].txs.length < 1000) {
                    addresses.splice(i, 1)
                    i--
                    continue
                }
                addresses[i].hash = maxHash
                addresses[i].start = maxStart
                console.log("looping address: " + addresses[i].address + ", start: " + addresses[i].start,
                    ", hash: " + addresses[i].hash)
            }
        }
        await window.electron.saveTransactions(txs)
    }
    await window.electron.generateHistory(addressList)
    if (typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
    setConnected(Status.Connected)
}

const loadOutputs = async ({addresses}) => {
    let variables = {}
    let paramsStrings = []
    let subQueries = []
    for (let i = 0; i < addresses.length; i++) {
        paramsStrings.push(`$address${i}: String!, $start${i}: Date, $tx${i}: String`)
        variables["address" + i] = addresses[i].address
        variables["start" + i] = addresses[i].timestamp
        variables["tx" + i] = addresses[i].hash
        subQueries.push(`
        address${i}: address(address: $address${i}) {
            address
            txs(start: $start${i}, tx: $tx${i}) {
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
                    script
                    spends {
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
                                script
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
                blocks {
                    hash
                    timestamp
                    height
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

export default UpdateHistory
