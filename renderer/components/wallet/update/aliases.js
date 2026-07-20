import bitcoincash, {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import bitcoin from "../../util/bitcoin";

// The profile GraphQL type does not expose 6d26 actions, so read recent
// transactions for each identity address and index valid alias scripts
// locally. The first input address is the protocol actor.
const SyncAliases = async ({addresses}) => {
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
    const data = await window.electron.graphQL(`query (${params}) { ${fields} }`, variables)
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
            const chunks = script.decompile(Buffer.from(output.script, "hex"))
            if (!chunks || chunks.length !== 4 || chunks[0] !== opcodes.OP_RETURN ||
                !Buffer.isBuffer(chunks[1]) || chunks[1].toString("hex") !== bitcoin.Prefix.SetAlias ||
                !Buffer.isBuffer(chunks[2]) || chunks[2].length !== 20 || !Buffer.isBuffer(chunks[3]) ||
                !chunks[3].length) {
                continue
            }
            aliases.push({
                tx_hash: tx.hash,
                address: signer.address,
                target_address: bitcoincash.address.toBase58Check(
                    chunks[2], bitcoincash.networks.bitcoin.pubKeyHash),
                alias: chunks[3].toString("utf8"),
            })
        }
    }
    await window.electron.saveTransactions(Object.values(transactions))
    await window.electron.saveAddressAliases(aliases)
    return await window.electron.getAddressAliases(addresses)
}

export default SyncAliases
