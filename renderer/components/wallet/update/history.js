import {Status} from "../../util/connect"

// The most transactions the index returns for an address in one query.
const PageSize = 1000

// The index pages an address by the time it first saw each transaction, so the
// sync resumes from the last transaction it reached (stored per address by
// saveAddressSync) rather than from a time worked out from what's already
// saved. Resuming from anything later than that transaction - a block
// timestamp, or a transaction some other sync saved out of order - silently
// skips every transaction the index saw in between, and a skipped transaction
// that spends a wallet output leaves that output listed as an unspent coin.
const UpdateHistory = async ({wallet, setConnected, setLastUpdate}) => {
    let addressList = wallet.addresses.concat(wallet.changeList, wallet.slpList || [])
    const syncs = await window.electron.getAddressSyncs(addressList)
    let addresses = new Array(addressList.length)
    for (let i = 0; i < addressList.length; i++) {
        addresses[i] = {
            address: addressList[i],
            hash: "", seen: null
        }
        for (let j = 0; j < syncs.length; j++) {
            if (syncs[j].address !== addressList[i]) {
                continue
            }
            addresses[i].hash = syncs[j].tx_hash
            addresses[i].seen = syncs[j].seen
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
        let pages = []
        for (let name in data) {
            if (data[name].txs == null) {
                console.log("ERROR: null outputs for address: " + data[name].address)
                console.log(data[name])
                continue
            }
            for (let j = 0; j < data[name].txs.length; j++) {
                txs.push(data[name].txs[j])
                for (let h = 0; h < data[name].txs[j].outputs.length; h++) {
                    if (!data[name].txs[j].outputs[h].spends) {
                        continue
                    }
                    for (let k = 0; k < data[name].txs[j].outputs[h].spends.length; k++) {
                        txs.push(data[name].txs[j].outputs[h].spends[k].tx)
                    }
                }
            }
            pages.push({address: data[name].address, txs: data[name].txs})
        }
        await window.electron.saveTransactions(txs)
        for (let p = 0; p < pages.length; p++) {
            // Only save the sync position once the page's transactions are in
            // the database, so an interrupted run resumes before them instead
            // of past them.
            const sync = await window.electron.saveAddressSync(pages[p].address,
                pages[p].txs.map(tx => ({hash: tx.hash, seen: tx.seen})))
            for (let j = 0; j < addresses.length; j++) {
                if (addresses[j].address !== pages[p].address) {
                    continue
                }
                // A short page is the end of the address's history. A full page
                // that doesn't move the sync forward would ask for the same
                // 1000 transactions until the loop runs out.
                if (pages[p].txs.length < PageSize || !sync ||
                    (sync.seen === addresses[j].seen && sync.tx_hash === addresses[j].hash)) {
                    addresses.splice(j, 1)
                    break
                }
                addresses[j].hash = sync.tx_hash
                addresses[j].seen = sync.seen
                console.log("looping address: " + addresses[j].address + ", seen: " + addresses[j].seen +
                    ", hash: " + addresses[j].hash)
                break
            }
        }
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
        paramsStrings.push(`$address${i}: Address!, $start${i}: Date, $tx${i}: Hash`)
        variables["address" + i] = addresses[i].address
        variables["start" + i] = addresses[i].seen
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
                    slp {
                        amount
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
                    slp_baton {
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
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
                                slp {
                                    amount
                                    token_hash
                                    genesis {
                                        hash
                                        token_type
                                        decimals
                                        ticker
                                        name
                                        doc_url
                                    }
                                }
                                slp_baton {
                                    token_hash
                                    genesis {
                                        hash
                                        token_type
                                        decimals
                                        ticker
                                        name
                                        doc_url
                                    }
                                }
                            }
                            blocks {
                                block {
                                    hash
                                    timestamp
                                    height
                                }
                            }
                        }
                    }
                }
                blocks {
                    block {
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

export default UpdateHistory
