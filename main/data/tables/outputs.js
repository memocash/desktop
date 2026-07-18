const {Select} = require("../sqlite");

const GetCoins = (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.*, " +
        "   blocks.height, " +
        "   slp_outputs.token_hash AS slp_token_hash, " +
        "   slp_outputs.amount AS slp_amount, " +
        "   slp_batons.token_hash AS slp_baton_token_hash, " +
        "   slp_geneses.ticker AS slp_ticker, " +
        "   slp_geneses.decimals AS slp_decimals " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = outputs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN slp_batons ON (slp_batons.hash = outputs.hash AND slp_batons.`index` = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = COALESCE(slp_outputs.token_hash, slp_batons.token_hash)) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY outputs.hash, outputs.`index` "
    return Select(conf, "outputs-coins", query, addresses)
}

module.exports = {
    GetCoins,
}
