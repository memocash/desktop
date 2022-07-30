const {Select} = require("../sqlite");

const GetPosts = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_posts.*, " +
        "   MIN(COALESCE(blocks.timestamp, tx_seens.timestamp), tx_seens.timestamp) AS timestamp " +
        "FROM memo_posts " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
        "WHERE memo_posts.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY memo_posts.tx_hash "
    return await Select(query, addresses)
}

module.exports = {
    GetPosts,
}
