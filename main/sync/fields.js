// The GraphQL fragments every index query is assembled from. They live in main
// because main is the only process that talks to the index for data it will
// store: the renderer never sees these queries, only the results main saved.

const BlockFields = `
    blocks {
        block {
            hash
            timestamp
            height
        }
    }
    `

const TxQuery = `
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
        ${BlockFields}
    }
    `

const TxTimeQuery = `
    tx {
        hash
        seen
        ${BlockFields}
    }
    `

const ProfileFields = `
    name {
        name
        tx_hash
        ${TxTimeQuery}
    }
    profile {
        text
        tx_hash
        ${TxTimeQuery}
    }
    pic {
        pic
        tx_hash
        ${TxTimeQuery}
    }
    `

const LikesQuery = `
    likes {
        tx_hash
        tip
        lock {
            address
        }
        ${TxQuery}
    }
    `

const PostFields = `
    tx_hash
    text
    ${TxQuery}
    ${LikesQuery}
    lock {
        address
        profile {
            ${ProfileFields}
        }
    }
    `

const GenesisFields = `
    genesis {
        hash
        token_type
        decimals
        ticker
        name
        doc_url
    }
    `

// Which outputs carry which tokens. The tx-level slp field beside it is the
// index's verdict on the whole transaction - NOT_SLP arrives as a null slp,
// otherwise validity is VALID, INVALID, or PENDING - and is what decides
// whether the tx's outputs may be spent at all.
const SlpOutputFields = `
    slp {
        amount
        token_hash
        ${GenesisFields}
    }
    slp_baton {
        token_hash
        ${GenesisFields}
    }
    `

// A wallet transaction as the history sync and the address subscription
// store it: raw, verdict, inputs, outputs with their token data, blocks.
// extraOutputFields nests more under each output - the history sync asks for
// the transactions that spend it, each in this same shape.
const WalletTxFields = (extraOutputFields = "") => `
    hash
    seen
    raw
    slp {
        validity
    }
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
        ${SlpOutputFields}
        ${extraOutputFields}
    }
    ${BlockFields}
    `

module.exports = {
    BlockFields,
    LikesQuery,
    PostFields,
    ProfileFields,
    SlpOutputFields,
    TxQuery,
    TxTimeQuery,
    WalletTxFields,
}
