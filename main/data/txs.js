const {Insert, Select} = require("./sqlite")

const SaveTransactions = async (transactions) => {
    for (let i = 0; i < transactions.length; i++) {
        await Insert("INSERT OR IGNORE INTO txs (hash) VALUES (?)", [transactions[i].hash])
        await Insert("INSERT OR IGNORE INTO tx_seens (hash, timestamp) VALUES (?, ?)", [
            transactions[i].hash, transactions[i].seen])
        await Insert("INSERT OR IGNORE INTO tx_raws (hash, raw) VALUES (?, ?)", [
            transactions[i].hash, Buffer.from(transactions[i].raw, "hex")])
        for (let j = 0; j < transactions[i].inputs.length; j++) {
            await Insert("INSERT OR IGNORE INTO inputs (hash, `index`, prev_hash, prev_index) VALUES (?, ?, ?, ?)", [
                transactions[i].hash, transactions[i].inputs[j].index,
                transactions[i].inputs[j].prev_hash, transactions[i].inputs[j].prev_index])
        }
        for (let j = 0; j < transactions[i].outputs.length; j++) {
            await Insert("INSERT OR IGNORE INTO outputs (hash, `index`, address, value) VALUES (?, ?, ?, ?)", [
                transactions[i].hash, transactions[i].outputs[j].index,
                transactions[i].outputs[j].lock.address, transactions[i].outputs[j].amount])
        }
        for (let j = 0; j < transactions[i].blocks.length; j++) {
            await Insert("INSERT OR IGNORE INTO blocks (hash, timestamp, height) VALUES (?, ?, ?)", [
                transactions[i].blocks[j].hash, transactions[i].blocks[j].timestamp, transactions[i].blocks[j].height])
            await Insert("INSERT OR IGNORE INTO block_txs (block_hash, tx_hash) VALUES (?, ?)", [
                transactions[i].blocks[j].hash, transactions[i].hash])
        }
    }
}

const GetTransactions = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   DISTINCT txs.*, " +
        "   MIN(COALESCE(tx_seens.timestamp, blocks.timestamp)," +
        "   COALESCE(blocks.timestamp, tx_seens.timestamp)) AS timestamp, " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN 0 ELSE outputs.value END) - " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN outputs.value ELSE 0 END) AS value " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "JOIN txs ON (outputs.hash = txs.hash OR inputs.hash = txs.hash) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = txs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = txs.hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY txs.hash " +
        "ORDER BY MIN(COALESCE(tx_seens.timestamp, blocks.timestamp), " +
        "   COALESCE(blocks.timestamp, tx_seens.timestamp)) DESC"
    return Select(query, addresses)
}

const GetWalletInfo = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   COUNT(DISTINCT (outputs.hash || outputs.`index`)) AS output_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN 1 ELSE 0 END), 0) AS utxo_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN outputs.value ELSE 0 END), 0) AS balance " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    return Select(query, addresses)
}

const GetRecentAddressTransactions = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.address, " +
        "   MAX(blocks.height) AS height " +
        "FROM outputs " +
        "JOIN block_txs ON (block_txs.tx_hash = outputs.hash) " +
        "JOIN blocks on (blocks.hash = block_txs.block_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    return Select(query, addresses)
}

const GetTransaction = async (txHash) => {
    const outputs = await Select("SELECT * FROM outputs WHERE hash = ?", [txHash])
    const inputs = await Select("SELECT * FROM inputs WHERE hash = ?", [txHash])
    let inputOutputsWhere = []
    let inputOutputsParams = []
    for (let i = 0; i < inputs.length; i++) {
        inputOutputsWhere.push("hash = ? AND `index` = ?")
        inputOutputsParams.push(inputs[i].prev_hash, inputs[i].prev_index)
    }
    const inputOutputs = await Select("SELECT * FROM outputs WHERE (" + inputOutputsWhere.join(") OR (") + ")",
        inputOutputsParams)
    for (let i = 0; i < inputs.length; i++) {
        for (let j = 0; j < inputOutputs.length; j++) {
            if (inputOutputs[j].hash === inputs[i].prev_hash && inputOutputs[j].index === inputs[i].prev_index) {
                inputs[i].output = inputOutputs[j]
                break
            }
        }
    }
    const seens = await Select("SELECT * FROM tx_seens WHERE hash = ?", [txHash])
    let seen
    if (seens && seens.length) {
        seen = seens[0]
    }
    const raws = await Select("SELECT * FROM tx_raws WHERE hash = ?", [txHash])
    let raw
    if (raws && raws.length) {
        raw = raws[0].raw
    }
    let block
    try {
        const blockTxs = await Select("SELECT * FROM block_txs WHERE tx_hash = ?", [txHash])
        const blocks = await Select("SELECT * FROM blocks WHERE hash = ?", [blockTxs[0].block_hash])
        block = blocks[0]
        const maxBlock = await Select("SELECT * FROM blocks ORDER BY height DESC LIMIT 1")
        block.confirmations = maxBlock[0].height - block.height
    } catch (e) {
    }
    return {outputs, inputs, seen, block, raw}
}

module.exports = {
    SaveTransactions,
    GetTransactions,
    GetTransaction,
    GetRecentAddressTransactions,
    GetWalletInfo,
}
