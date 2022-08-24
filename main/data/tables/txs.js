const {Insert, Select} = require("../sqlite")

const SaveTransactions = async (conf, transactions) => {
    if (!transactions || !transactions.length) {
        return
    }
    for (let i = 0; i < transactions.length; i++) {
        await Insert(conf, "txs", "INSERT OR IGNORE INTO txs (hash) VALUES (?)", [transactions[i].hash])
        await Insert(conf, "tx_seens", "INSERT OR IGNORE INTO tx_seens (hash, timestamp) VALUES (?, ?)", [
            transactions[i].hash, transactions[i].seen])
        await Insert(conf, "tx_raws", "INSERT OR IGNORE INTO tx_raws (hash, raw) VALUES (?, ?)", [
            transactions[i].hash, Buffer.from(transactions[i].raw, "hex")])
        for (let j = 0; j < transactions[i].inputs.length; j++) {
            await Insert(conf, "inputs",
                "INSERT OR IGNORE INTO inputs (hash, `index`, prev_hash, prev_index) VALUES (?, ?, ?, ?)", [
                    transactions[i].hash, transactions[i].inputs[j].index,
                    transactions[i].inputs[j].prev_hash, transactions[i].inputs[j].prev_index])
        }
        for (let j = 0; j < transactions[i].outputs.length; j++) {
            await Insert(conf, "outputs",
                "INSERT OR IGNORE INTO outputs (hash, `index`, address, value) VALUES (?, ?, ?, ?)", [
                    transactions[i].hash, transactions[i].outputs[j].index,
                    transactions[i].outputs[j].lock.address, transactions[i].outputs[j].amount])
        }
        if (!transactions[i].blocks) {
            continue
        }
        for (let j = 0; j < transactions[i].blocks.length; j++) {
            await Insert(conf, "blocks", "INSERT OR IGNORE INTO blocks (hash, timestamp, height) VALUES (?, ?, ?)", [
                transactions[i].blocks[j].hash, transactions[i].blocks[j].timestamp, transactions[i].blocks[j].height])
            await Insert(conf, "block_txs", "INSERT OR IGNORE INTO block_txs (block_hash, tx_hash) VALUES (?, ?)", [
                transactions[i].blocks[j].hash, transactions[i].hash])
        }
    }
}

const SaveBlock = async (conf, block) => {
    if (!block) {
        return
    }
    await Insert(conf, "blocks", "INSERT OR IGNORE INTO blocks (hash, timestamp, height) VALUES (?, ?, ?)", [
        block.hash, block.timestamp, block.height])
}

const GetTransactions = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   hash, " +
        "   timestamp, " +
        "   height, " +
        "   COALESCE((SELECT MAX(height)+1 FROM blocks) - height, 0) AS confirms, " +
        "   SUM(value) AS value " +
        "FROM history " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY hash " +
        "ORDER BY timestamp DESC"
    return Select(conf, "history", query, addresses)
}

const GenerateHistory = async (conf, addresses) => {
    await Insert(conf, "history",
        "INSERT OR REPLACE INTO history (address, hash, timestamp, height, value) " +
        "SELECT " +
        "   outputs.address, " +
        "   txs.hash AS hash, " +
        "   MIN(COALESCE(tx_seens.timestamp, blocks.timestamp)," +
        "   COALESCE(blocks.timestamp, tx_seens.timestamp)) AS timestamp, " +
        "   MIN(blocks.height) AS height, " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN 0 ELSE outputs.value END) - " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN outputs.value ELSE 0 END) AS value " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "JOIN txs ON (outputs.hash = txs.hash OR inputs.hash = txs.hash) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = txs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = txs.hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY outputs.address, txs.hash " +
        "ORDER BY MIN(COALESCE(tx_seens.timestamp, blocks.timestamp), " +
        "   COALESCE(blocks.timestamp, tx_seens.timestamp)) DESC" +
        "", addresses)
}

const GetWalletInfo = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   COUNT(DISTINCT (outputs.hash || outputs.`index`)) AS output_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN 1 ELSE 0 END), 0) AS utxo_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN outputs.value ELSE 0 END), 0) AS balance " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    return Select(conf, "outputs-wallet-info", query, addresses)
}

const GetRecentAddressTransactions = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.address, " +
        "   MAX(blocks.height) AS height " +
        "FROM outputs " +
        "JOIN block_txs ON (block_txs.tx_hash = outputs.hash) " +
        "JOIN blocks on (blocks.hash = block_txs.block_hash) " +
        "JOIN history ON (history.address = outputs.address) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY outputs.address "
    return Select(conf, "recent-address-transactions", query, addresses)
}

const GetTransaction = async (conf, txHash) => {
    const outputs = await Select(conf, "transaction-outputs", "SELECT * FROM outputs WHERE hash = ?", [txHash])
    const inputs = await Select(conf, "transaction-inputs", "SELECT * FROM inputs WHERE hash = ?", [txHash])
    if (inputs.length > 0) {
        let inputOutputsWhere = []
        let inputOutputsParams = []
        for (let i = 0; i < inputs.length; i++) {
            inputOutputsWhere.push("hash = ? AND `index` = ?")
            inputOutputsParams.push(inputs[i].prev_hash, inputs[i].prev_index)
        }
        const inputOutputs = await Select(conf, "transaction-input-outputs", "SELECT * FROM outputs WHERE (" + inputOutputsWhere.join(") OR (") + ")",
            inputOutputsParams)
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < inputOutputs.length; j++) {
                if (inputOutputs[j].hash === inputs[i].prev_hash && inputOutputs[j].index === inputs[i].prev_index) {
                    inputs[i].output = inputOutputs[j]
                    break
                }
            }
        }
    }
    const seens = await Select(conf, "tx_seens", "SELECT * FROM tx_seens WHERE hash = ?", [txHash])
    let seen
    if (seens && seens.length) {
        seen = seens[0]
    }
    const raws = await Select(conf, "tx_raws", "SELECT * FROM tx_raws WHERE hash = ?", [txHash])
    let raw
    if (raws && raws.length) {
        raw = raws[0].raw
    }
    let block
    try {
        const blockTxs = await Select(conf, "block_txs", "SELECT * FROM block_txs WHERE tx_hash = ?", [txHash])
        const blocks = await Select(conf, "blocks", "SELECT * FROM blocks WHERE hash = ?", [blockTxs[0].block_hash])
        block = blocks[0]
        const maxBlock = await Select(conf, "blocks-max", "SELECT * FROM blocks ORDER BY height DESC LIMIT 1")
        block.confirmations = maxBlock[0].height - block.height
    } catch (e) {
    }
    return {outputs, inputs, seen, block, raw}
}

const GetUtxos = async (conf, addresses) => {
    const query = "" +
        "SELECT outputs.* FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL"
    return Select(conf, "outputs-utxos", query, addresses)
}

module.exports = {
    GenerateHistory,
    GetRecentAddressTransactions,
    GetTransaction,
    GetTransactions,
    GetUtxos,
    GetWalletInfo,
    SaveBlock,
    SaveTransactions,
}
