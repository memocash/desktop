const {Select} = require("../sqlite")
const {MaxFollows} = require("../common/memo_follow");

const GetFollowing = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_follows.follow_address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data, " +
        "   max_follows.timestamp " +
        "FROM memo_follows " +
        "JOIN (" +
        "   SELECT " +
        "       unfollow, " +
        "       SUBSTR(MIN(printf('%07d', 1000000 - COALESCE(height, 1000000)) || " +
        "           memo_follows.tx_hash), 8) AS tx_hash, " +
        "       MIN(" +
        "           COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "           COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "       ) AS timestamp " +
        "   FROM memo_follows " +
        "   LEFT JOIN block_txs ON (block_txs.tx_hash = memo_follows.tx_hash) " +
        "   LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "   LEFT JOIN tx_seens ON (tx_seens.hash = memo_follows.tx_hash) " +
        "   WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "   GROUP BY address, follow_address " +
        ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_follows.follow_address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE max_follows.unfollow = 0 " +
        "ORDER BY max_follows.timestamp DESC " +
        "LIMIT 50 "
    return await Select("memo_follows-following", query, addresses)
}

const GetFollowers = async (addresses) => {
    const maxFollowsWhere = "follow_address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   memo_follows.address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data, " +
        "   max_follows.timestamp " +
        "FROM memo_follows " +
        "JOIN (" + MaxFollows(maxFollowsWhere) + ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_follows.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE max_follows.unfollow = 0 " +
        "ORDER BY max_follows.timestamp DESC " +
        "LIMIT 50 "
    return await Select("memo_follows-followers", query, addresses)
}

const GetRecentFollow = async (addresses, address) => {
    const query = "" +
        "SELECT " +
        "   memo_follows.*, " +
        "   block_txs.block_hash AS block_hash " +
        "FROM memo_follows " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE memo_follows.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND memo_follows.follow_address = ? " +
        "ORDER BY COALESCE(blocks.height, 1000000) DESC, memo_follows.tx_hash ASC " +
        "LIMIT 1"
    addresses.push(address)
    const results = await Select("memo_follows-recent", query, addresses)
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

module.exports = {
    GetFollowers,
    GetFollowing,
    GetRecentFollow,
}
