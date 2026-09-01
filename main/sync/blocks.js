const {GraphQL} = require("../client/graphql")
const {GenerateHistory, SaveBlock} = require("../data/tables")

const BlockFields = `
    hash
    timestamp
    height
    `

const BlocksSubscription = `
    subscription {
        blocks {
            ${BlockFields}
        }
    }
    `

// The chain tip, so confirmations count from the right height before any
// history has synced. A failure here is logged and not fatal: the history
// sync's own block rows catch the tip up as they arrive.
const SyncBlock = async ({conf, graphQL = GraphQL}) => {
    try {
        const data = await graphQL({network: conf, query: `
            query {
                block_newest {
                    ${BlockFields}
                }
            }
            `, variables: {}})
        await SaveBlock(conf, data.data.block_newest)
    } catch (e) {
        console.log(e)
    }
}

// A block from the subscription: stored, then the history rows rebuilt so
// every confirmation count moves with the tip.
const SaveNewBlock = async ({conf, block, addresses}) => {
    await SaveBlock(conf, block)
    if (addresses && addresses.length) {
        await GenerateHistory(conf, addresses)
    }
}

module.exports = {
    BlocksSubscription,
    SaveNewBlock,
    SyncBlock,
}
