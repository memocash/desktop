import {BeginActivity, Plural} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";
import {AnsweredTx} from "./slp_core";

const BatchSize = 50

// Token balances are shown on both of these tabs, and neither can be trusted
// until the pre-SLP transactions have been checked.
const SlpScopes = [Tabs.Tokens, Tabs.Coins]

// The tx-level slp field is the index's verdict on the whole transaction -
// NOT_SLP arrives as a null slp, otherwise validity is VALID, INVALID, or
// PENDING - and is what decides whether the tx's outputs may be spent at all
// (see SlpVerified in util/tx_build). The per-output fields below answer
// which outputs carry which tokens.
const SlpOutputFields = `
slp {
    validity
}
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
const UpdateSlp = async ({addresses, setLastUpdate, scopes = SlpScopes}) => {
    const unchecked = await window.electron.getUncheckedSlpTxs(addresses)
    if (!unchecked || !unchecked.length) {
        return
    }
    const activity = BeginActivity(`Checking ${Plural(unchecked.length, "transaction")} for tokens`, {scopes})
    try {
        await checkSlp({unchecked, setLastUpdate, activity})
    } catch (e) {
        activity.fail(e)
        throw e
    }
    activity.end(`Checked ${Plural(unchecked.length, "transaction")} for tokens`)
}

const checkSlp = async ({unchecked, setLastUpdate, activity}) => {
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
            activity.fail(e)
            return
        }
        let txs = []
        for (let i = 0; i < batch.length; i++) {
            // Only a tx the server evidences knowing (it has outputs) carries
            // a verdict; a missing tx or a bare echo stub is saved in the
            // unanswered shape, staying unspendable and re-asked. See
            // AnsweredTx for the stub the batch resolver returns.
            txs.push(AnsweredTx(data.data["tx" + i], batch[i].hash))
        }
        await window.electron.saveSlp(txs)
    }
    if (typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

export default UpdateSlp
