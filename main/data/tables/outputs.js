const {Select} = require("../sqlite");
const {SlpAmount} = require("./slp");

const GetCoins = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.*, " +
        "   blocks.height, " +
        "   slp_outputs.token_hash AS slp_token_hash, " +
        "   slp_outputs.amount AS slp_amount, " +
        "   slp_batons.token_hash AS slp_baton_token_hash, " +
        "   slp_geneses.ticker AS slp_ticker, " +
        "   slp_geneses.decimals AS slp_decimals, " +
        "   slp_checks.validity AS slp_validity " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = outputs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN slp_batons ON (slp_batons.hash = outputs.hash AND slp_batons.`index` = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = COALESCE(slp_outputs.token_hash, slp_batons.token_hash)) " +
        "LEFT JOIN slp_checks ON (slp_checks.hash = outputs.hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY outputs.hash, outputs.`index` "
    // Stored two's-complement back to the on-chain uint64, as everywhere.
    return (await Select(conf, "outputs-coins", query, addresses)).map((row) => {
        if (row.slp_amount != null) {
            row.slp_amount = SlpAmount(row.slp_amount)
        }
        return row
    })
}

module.exports = {
    GetCoins,
}
