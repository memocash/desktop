const {GraphQL} = require("../client/graphql")
const {GetUncheckedSlpTxs, SaveSlp} = require("../data/tables")
const {SlpOutputFields} = require("./fields")
const {ErrorMessage} = require("./history")

const BatchSize = 50

// What the backfill saves for one queried transaction. The index's batch
// resolver echoes a hash it does not know as a stub - {hash, slp: null,
// outputs: []}, no error - while a transaction it knows always carries at
// least one output. A stub's null slp is an absence, not a verdict: saving it
// as answered would mark an unknown transaction NOT_SLP and open exactly the
// fail-open hole the validity work closes. So only a tx with outputs is the
// server's answer; anything else is saved in the unanswered shape (no slp
// key), which stores a NULL verdict that stays unspendable and keeps being
// re-asked.
const AnsweredTx = (returned, hash) =>
    returned && returned.outputs && returned.outputs.length ?
        returned : {hash, outputs: []}

// Checks UTXO transactions synced before SLP support - or whose verdict the
// index hadn't settled - for SLP token data. Newly synced transactions include
// SLP fields directly, so each tx only ever needs to be checked once (tracked
// in the slp_checks table). report hears {unchecked} once the count is known.
// An index failure ends the sync with what was saved so far and the error,
// rather than throwing: the transactions still unchecked stay unspendable and
// are re-asked next time.
const SyncSlp = async ({conf, addresses, report = () => {}, graphQL = GraphQL}) => {
    const unchecked = await GetUncheckedSlpTxs(conf, addresses)
    if (!unchecked || !unchecked.length) {
        return {checked: 0}
    }
    report({unchecked: unchecked.length})
    let checked = 0
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
                slp {
                    validity
                }
                outputs {
                    index
                    ${SlpOutputFields}
                }
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
            data = await graphQL({network: conf, query, variables})
        } catch (e) {
            console.log("Error checking transactions for SLP data")
            console.log(e)
            return {checked, error: ErrorMessage(e)}
        }
        let txs = []
        for (let i = 0; i < batch.length; i++) {
            txs.push(AnsweredTx(data.data["tx" + i], batch[i].hash))
        }
        await SaveSlp(conf, txs)
        checked += batch.length
    }
    return {checked}
}

module.exports = {
    AnsweredTx,
    SyncSlp,
}
