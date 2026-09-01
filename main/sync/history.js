const {GraphQL} = require("../client/graphql")
const {GenerateHistory, GetAddressSyncs, SaveAddressSync, SaveTransactions} = require("../data/tables")
const {WalletTxFields} = require("./fields")

// The most transactions the index returns for an address in one query.
const PageSize = 1000

// Rounds of paging one sync will do before giving up on an address that keeps
// returning full pages.
const MaxRounds = 100

// Downloads the transaction history of a wallet's addresses from the index and
// stores it, entirely in main: the renderer asks for a sync and hears how it
// went, but never handles a transaction on its way into the database.
//
// The index pages an address by the time it first saw each transaction, so the
// sync resumes from the last transaction it reached (stored per address by
// SaveAddressSync) rather than from a time worked out from what's already
// saved. Resuming from anything later than that transaction - a block
// timestamp, or a transaction some other sync saved out of order - silently
// skips every transaction the index saw in between, and a skipped transaction
// that spends a wallet output leaves that output listed as an unspent coin.
//
// report hears progress as it happens: {saved} with the running total after
// each round that stored something, and {updated: true} whenever the history
// table has been regenerated and the wallet's panes have new rows to show.
// The result says how many transactions were stored and whether the index
// answered; a round the index failed ends the sync early rather than
// throwing, with what it managed to save already stored.
const SyncHistory = async ({conf, addresses: addressList, report = () => {}, graphQL = GraphQL}) => {
    let saved = 0
    const syncs = await GetAddressSyncs(conf, addressList)
    let addresses = addressList.map((address) => {
        const sync = syncs.find(sync => sync.address === address)
        return {address, hash: sync ? sync.tx_hash : "", seen: sync ? sync.seen : null}
    })
    for (let i = 0; i < MaxRounds && addresses.length; i++) {
        let data
        try {
            data = await loadOutputs({conf, addresses, graphQL})
        } catch (e) {
            console.log("Error connecting to index server")
            console.log(e)
            return {saved, connected: false, error: errorMessage(e)}
        }
        let txs = []
        let pages = []
        for (let name in data) {
            if (data[name].txs == null) {
                // An address the index answers with nothing is done for this
                // run - asking again next round would only get the same
                // answer, MaxRounds times over.
                console.log("ERROR: null outputs for address: " + data[name].address)
                console.log(data[name])
                addresses = addresses.filter(address => address.address !== data[name].address)
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
        await SaveTransactions(conf, txs)
        if (txs.length) {
            // The running total, not this round's count: a big wallet pages
            // through the same size batch over and over, and a column of
            // identical "Saved 2,000 transactions" lines says nothing about
            // whether the download is getting anywhere.
            saved += txs.length
            report({saved})
        }
        for (let p = 0; p < pages.length; p++) {
            // Only save the sync position once the page's transactions are in
            // the database, so an interrupted run resumes before them instead
            // of past them.
            const sync = await SaveAddressSync(conf, pages[p].address,
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
                break
            }
        }
        // Publish each round rather than only at the end. The History tab reads
        // the history table, which nothing but GenerateHistory writes, so a
        // wallet with several pages of transactions used to sit on last
        // session's rows (or on nothing at all, the first time) until the whole
        // download finished. Regenerating per round costs one pass over the
        // saved outputs, and only when that round actually brought something
        // back.
        if (txs.length) {
            await GenerateHistory(conf, addressList)
            report({updated: true})
        }
    }
    // Again at the end, for the run that saved nothing: confirmations move with
    // every block, so the rows still need rebuilding against the current tip.
    await GenerateHistory(conf, addressList)
    return {saved, connected: true}
}

// GraphQL rejections are arrays of {message}, other failures are Errors.
const errorMessage = (e) => {
    if (Array.isArray(e)) {
        return e.map(err => err && err.message ? err.message : JSON.stringify(err)).join(", ")
    }
    return e && e.message ? e.message : String(e)
}

const loadOutputs = async ({conf, addresses, graphQL}) => {
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
                ${WalletTxFields(`
                spends {
                    tx {
                        ${WalletTxFields()}
                    }
                }
                `)}
            }
        }
        `)
    }
    const query = `
    query (${paramsStrings.join(", ")}) {
        ${subQueries.join("\n")}
    }
    `
    const data = await graphQL({network: conf, query, variables})
    return data.data
}

module.exports = {
    ErrorMessage: errorMessage,
    PageSize,
    SyncHistory,
}
