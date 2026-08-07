const {Select} = require("../sqlite")
const {MaxFollows} = require("../common/memo_follow");
const {clusterField, historicallyValid, linkedClusterCte, txJoinTimestamp} = require("../common/profile_links");

const LinkedCluster = (origin, followsWhere) => linkedClusterCte({
    cluster: "linked_cluster",
    seedSelect: origin + ", " + origin,
    seedFrom: "memo_follows",
    seedWhere: followsWhere,
})

// Most recent post by each followed identity, used as the "last active" signal
// in the following list. Aggregating the followed addresses' posts once and
// joining is much cheaper than a correlated subquery per row, which would
// re-walk memo_posts for every followed address. Post time follows the same
// block/seen preference as the post lists themselves.
const LastClusterPosts = "" +
    "SELECT " +
    "    linked_cluster.origin AS address, " +
    "    MAX(" + txJoinTimestamp + ") AS timestamp " +
    "FROM linked_cluster " +
    "JOIN memo_posts ON (memo_posts.address = linked_cluster.address) " +
    "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
    "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
    "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
    "WHERE " + historicallyValid("memo_posts.address", "memo_posts.tx_hash") + " " +
    "GROUP BY linked_cluster.origin "

const clusterName = (origin) => clusterField({
    cluster: "linked_cluster", origin,
    join: "JOIN profile_names ON (profile_names.tx_hash = profiles.name) ",
    field: "profile_names.name", txHash: "profile_names.tx_hash",
})

const clusterPic = (origin) => clusterField({
    cluster: "linked_cluster", origin,
    join: "JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) ",
    field: "profile_pics.pic", txHash: "profile_pics.tx_hash",
})

const clusterPicData = (origin) => "(" +
    "SELECT images.data FROM images WHERE images.url = " + clusterPic(origin) +
    ")"

const GetFollowing = async (conf, addresses, {limit = 50} = {}) => {
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) {
        limit = 50
    }
    const addressIn = "address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        // The cluster CTE binds its own copy of the wallet addresses, ahead of
        // the ones MaxFollows takes below.
        LinkedCluster("memo_follows.follow_address", "memo_follows." + addressIn) +
        "SELECT " +
        "   memo_follows.follow_address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   " + clusterName("memo_follows.follow_address") + " AS name, " +
        "   " + clusterPic("memo_follows.follow_address") + " AS pic, " +
        "   " + clusterPicData("memo_follows.follow_address") + " AS pic_data, " +
        "   max_follows.timestamp, " +
        "   last_posts.timestamp AS last_activity " +
        "FROM memo_follows " +
        // One row per followed address for the whole identity: two of its
        // addresses following the same person is one follow, and an unfollow
        // from either of them ends it.
        "JOIN (" + MaxFollows(addressIn, "follow_address") +
        ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN (" + LastClusterPosts + ") last_posts ON (last_posts.address = memo_follows.follow_address) " +
        "WHERE max_follows.unfollow = 0 " +
        // Never-active follows have a NULL activity time, which SQLite sorts
        // last under DESC - the limit keeps the most recently active instead.
        "ORDER BY last_activity DESC, max_follows.timestamp DESC " +
        (limit === null ? "" : "LIMIT ? ")
    const variables = [...addresses, ...addresses].concat(limit === null ? [] : limit)
    return await Select(conf, "memo_follows-following", query, variables)
}

const GetFollowers = async (conf, addresses) => {
    const followAddressIn = "follow_address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        LinkedCluster("memo_follows.address", "memo_follows." + followAddressIn) +
        "SELECT " +
        "   memo_follows.address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   " + clusterName("memo_follows.address") + " AS name, " +
        "   " + clusterPic("memo_follows.address") + " AS pic, " +
        "   " + clusterPicData("memo_follows.address") + " AS pic_data, " +
        "   max_follows.timestamp " +
        "FROM memo_follows " +
        // Mirror of GetFollowing: one row per follower, whichever of the
        // followed identity's addresses they followed.
        "JOIN (" + MaxFollows(followAddressIn, "address") +
        ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "WHERE max_follows.unfollow = 0 " +
        "ORDER BY max_follows.timestamp DESC " +
        "LIMIT 50 "
    return await Select(conf, "memo_follows-followers", query, [...addresses, ...addresses])
}

const GetRecentFollow = async (conf, addresses, address) => {
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
    const results = await Select(conf, "memo_follows-recent", query, addresses)
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
