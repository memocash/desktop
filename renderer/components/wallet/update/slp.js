const BatchSize = 50

const SlpOutputFields = `
outputs {
    index
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
`

// Checks UTXO transactions synced before SLP support for SLP token data.
// Newly synced transactions include SLP fields directly, so each tx only ever
// needs to be checked once (tracked in the slp_checks table).
const UpdateSlp = async ({addresses, setLastUpdate}) => {
    const unchecked = await window.electron.getUncheckedSlpTxs(addresses)
    if (!unchecked || !unchecked.length) {
        return
    }
    for (let offset = 0; offset < unchecked.length; offset += BatchSize) {
        const batch = unchecked.slice(offset, offset + BatchSize)
        let variables = {}
        let paramsStrings = []
        let subQueries = []
        for (let i = 0; i < batch.length; i++) {
            paramsStrings.push(`$hash${i}: Hash!`)
            variables["hash" + i] = batch[i].hash
            subQueries.push(`
            tx${i}: tx(hash: $hash${i}) {
                hash
                ${SlpOutputFields}
            }
            `)
        }
        const query = `
        query (${paramsStrings.join(", ")}) {
            ${subQueries.join("\n")}
        }
        `
        let data
        try {
            data = await window.electron.graphQL(query, variables)
        } catch (e) {
            console.log("Error checking transactions for SLP data")
            console.log(e)
            return
        }
        let txs = []
        for (let i = 0; i < batch.length; i++) {
            // Mark txs the server didn't return as checked too, so they aren't
            // re-queried every update.
            txs.push(data.data["tx" + i] || {hash: batch[i].hash, outputs: []})
        }
        await window.electron.saveSlp(txs)
    }
    if (typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

export default UpdateSlp
