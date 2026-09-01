const {GraphQL} = require("../client/graphql")
const {GenerateHistory, GetTransaction, SaveTransactions} = require("../data/tables")
const {BlockFields, WalletTxFields} = require("./fields")

const TxsSubscription = `
    subscription($addresses: [Address!]) {
        addresses(addresses: $addresses) {
            ${WalletTxFields()}
        }
    }
    `

// A wallet transaction pushed by the subscription: stored with its tokens and
// verdict, then the history rows rebuilt so the panes waiting on it update.
const SaveNewTx = async ({conf, tx, addresses}) => {
    await SaveTransactions(conf, [tx])
    if (addresses && addresses.length) {
        await GenerateHistory(conf, addresses)
    }
}

// Include each referenced output so an arbitrary transaction has enough
// context to show input addresses/values and calculate its fee, even when
// neither it nor its parents have been synced to the local database yet.
const TransactionQuery = `
    query ($hash: Hash!) {
        tx(hash: $hash) {
            hash
            seen
            raw
            inputs {
                index
                prev_hash
                prev_index
                output {
                    index
                    amount
                    script
                    lock {
                        address
                    }
                }
            }
            outputs {
                index
                amount
                script
                lock {
                    address
                }
            }
            ${BlockFields}
        }
    }
    `

// A transaction the transaction window wants to show but the wallet's own
// sync never brought in: fetched from the index, stored, and read back the
// way every stored transaction is. Nothing about it is spendable - the query
// asks for no SLP verdict, so its outputs stay unverified - it is here to be
// looked at.
const FetchTransaction = async ({conf, hash, graphQL = GraphQL}) => {
    const response = await graphQL({network: conf, query: TransactionQuery, variables: {hash}})
    const remoteTx = response && response.data && response.data.tx
    if (remoteTx) {
        // GetTransaction resolves input details by joining their previous
        // outputs. Store lightweight parent records first so that join also
        // works for a tx fetched outside the wallet's normal address-based
        // sync.
        const parents = remoteTx.inputs
            .filter(input => input.output)
            .map(input => ({
                hash: input.prev_hash,
                outputs: [{...input.output, index: input.prev_index}],
            }))
        await SaveTransactions(conf, parents.concat(remoteTx))
    }
    return GetTransaction(conf, hash)
}

module.exports = {
    FetchTransaction,
    SaveNewTx,
    TxsSubscription,
}
