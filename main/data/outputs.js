const {Select} = require("./sqlite");
const GetCoins = (addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.*, " +
        "   blocks.height " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = outputs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY outputs.hash, outputs.`index` "
    return Select(query, addresses)
}

module.exports = {
    GetCoins,
}
