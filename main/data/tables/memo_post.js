const {Select} = require("../sqlite");

const GetPosts = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_posts.*, " +
        "   profile_names.name, " +
        "   images.data AS pic, " +
        "   MIN(COALESCE(blocks.timestamp, tx_seens.timestamp), tx_seens.timestamp) AS timestamp " +
        "FROM memo_posts " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_posts.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE memo_posts.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY memo_posts.tx_hash "
    return await Select(query, addresses)
}

module.exports = {
    GetPosts,
}
