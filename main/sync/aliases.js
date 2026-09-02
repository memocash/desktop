const {GraphQL} = require("../client/graphql")
const {GetAddressAliases, SaveAddressAliases, SaveTransactions} = require("../data/tables")
const baddress = require("../common/bitcoin/address")
const networks = require("../common/bitcoin/networks")
const bscript = require("../common/bitcoin/script")
const opcodes = require("../common/bitcoin/opcodes.json")
const {Prefix} = require("../common/memo")

// The profile GraphQL type does not expose 6d26 actions, so read recent
// transactions for each identity address and index valid alias scripts
// locally. The first input address is the protocol actor. Returns the aliases
// now stored for the addresses.
const SyncAliases = async ({conf, addresses, graphQL = GraphQL}) => {
    if (!addresses || !addresses.length) {
        return []
    }
    const params = addresses.map((_, i) => `$address${i}: Address!`).join(", ")
    const fields = addresses.map((_, i) => `
        address${i}: address(address: $address${i}) {
            txs(limit: 1000) {
                hash
                seen
                inputs { index prev_hash prev_index output { lock { address } } }
                outputs { index amount script lock { address } }
                blocks { block { hash timestamp height } }
            }
        }
    `).join("\n")
    const variables = {}
    addresses.forEach((address, i) => variables[`address${i}`] = address)
    const data = await graphQL({network: conf, query: `query (${params}) { ${fields} }`, variables})
    const transactions = {}
    for (const result of Object.values(data.data || {})) {
        for (const tx of (result && result.txs) || []) {
            transactions[tx.hash] = tx
        }
    }
    const aliases = []
    for (const tx of Object.values(transactions)) {
        const signer = tx.inputs && tx.inputs[0] && tx.inputs[0].output && tx.inputs[0].output.lock
        if (!signer || !addresses.includes(signer.address)) {
            continue
        }
        for (const output of tx.outputs || []) {
            const chunks = bscript.decompile(Buffer.from(output.script, "hex"))
            if (!chunks || chunks.length !== 4 || chunks[0] !== opcodes.OP_RETURN ||
                !Buffer.isBuffer(chunks[1]) || chunks[1].toString("hex") !== Prefix.SetAlias ||
                !Buffer.isBuffer(chunks[2]) || chunks[2].length !== 20 || !Buffer.isBuffer(chunks[3]) ||
                !chunks[3].length) {
                continue
            }
            aliases.push({
                tx_hash: tx.hash,
                address: signer.address,
                target_address: baddress.toBase58Check(chunks[2], networks.bitcoin.pubKeyHash),
                alias: chunks[3].toString("utf8"),
            })
        }
    }
    await SaveTransactions(conf, Object.values(transactions))
    await SaveAddressAliases(conf, aliases)
    return GetAddressAliases(conf, addresses)
}

module.exports = {
    SyncAliases,
}
