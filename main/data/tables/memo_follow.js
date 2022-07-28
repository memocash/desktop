const {Select} = require("../sqlite")

const GetFollowing = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_follows.follow_address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data " +
        "FROM memo_follows " +
        "JOIN (" +
        "   SELECT " +
        "       unfollow, " +
        "       SUBSTR(MIN(printf('%07d', 1000000 - COALESCE(height, 1000000)) || " +
        "           memo_follows.tx_hash), 8) AS tx_hash " +
        "   FROM memo_follows " +
        "   LEFT JOIN block_txs ON (block_txs.tx_hash = memo_follows.tx_hash) " +
        "   LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "   WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ")" +
        "   GROUP BY address, follow_address " +
        ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_follows.follow_address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE max_follows.unfollow = 0 "
    return await Select(query, addresses)
}

module.exports = {
    GetFollowing,
}
