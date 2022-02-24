const {Insert, Select} = require("./sqlite")

const SaveTransactions = async (transactions) => {
    for (let i = 0; i < transactions.length; i++) {
        await Insert("INSERT OR IGNORE INTO txs (hash) VALUES (?)", [transactions[i].hash])
        await Insert("INSERT OR IGNORE INTO tx_seens (hash, timestamp) VALUES (?, ?)", [
            transactions[i].hash, transactions[i].seen])
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
    const query = `
        SELECT DISTINCT txs.*,
                        MIN(tx_seens.timestamp, blocks.timestamp)                           AS timestamp,
                        SUM(CASE WHEN inputs.hash = txs.hash THEN 0 ELSE outputs.value END) -
                        SUM(CASE WHEN inputs.hash = txs.hash THEN outputs.value ELSE 0 END) AS value
        FROM outputs
                 LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.\`index\`)
                 JOIN txs ON (outputs.hash = txs.hash OR inputs.hash = txs.hash)
                 LEFT JOIN block_txs ON (block_txs.tx_hash = txs.hash)
                 LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash)
                 LEFT JOIN tx_seens ON (tx_seens.hash = txs.hash)
        WHERE outputs.address IN (${"?" + Array(addresses.length).join(", ?")})
        GROUP BY txs.hash
        ORDER BY MIN(blocks.timestamp, tx_seens.timestamp) DESC
    `
    return Select(query, addresses)
}

module.exports = {
    SaveTransactions,
    GetTransactions,
}
