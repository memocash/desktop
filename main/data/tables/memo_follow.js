const {Select} = require("../sqlite")
const {MaxFollows} = require("../common/memo_follow");
const {historicallyValid} = require("../common/profile_links");

// Every address a followed identity posts as: the followed address plus its
// transitive accepted-link cluster, keyed back to the address actually
// followed. The feed expands followed profiles the same way (SyncProfileLinks
// feeding GetPosts), so without this a profile that posts from a linked
// address reads as never active here while its posts show up in the feed.
// Revoked links stay in the cluster - only their post-revoke records drop out,
// which historicallyValid enforces below.
const FollowedCluster = (followsWhere) => "" +
    "WITH RECURSIVE active_profile_links(address, linked_address) AS (" +
    "    SELECT link_requests.address, link_requests.parent_address " +
    "    FROM link_requests " +
    "    JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
    "    UNION " +
    "    SELECT link_requests.parent_address, link_requests.address " +
    "    FROM link_requests " +
    "    JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
    "), followed_cluster(origin, address) AS (" +
    "    SELECT DISTINCT memo_follows.follow_address, memo_follows.follow_address " +
    "    FROM memo_follows " +
    "    WHERE " + followsWhere +
    "    UNION " +
    "    SELECT followed_cluster.origin, active_profile_links.linked_address " +
    "    FROM followed_cluster " +
    "    JOIN active_profile_links ON (active_profile_links.address = followed_cluster.address)" +
    ") "

// Most recent post by each followed identity, used as the "last active" signal
// in the following list. Aggregating the followed addresses' posts once and
// joining is much cheaper than a correlated subquery per row, which would
// re-walk memo_posts for every followed address. Post time follows the same
// block/seen preference as the post lists themselves.
const LastClusterPosts = "" +
    "SELECT " +
    "    followed_cluster.origin AS address, " +
    "    MAX(MIN(" +
    "        COALESCE(blocks.timestamp, tx_seens.timestamp), " +
    "        COALESCE(tx_seens.timestamp, blocks.timestamp)" +
    "    )) AS timestamp " +
    "FROM followed_cluster " +
    "JOIN memo_posts ON (memo_posts.address = followed_cluster.address) " +
    "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
    "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
    "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
    "WHERE " + historicallyValid("memo_posts.address", "memo_posts.tx_hash") + " " +
    "GROUP BY followed_cluster.origin "

const GetFollowing = async (conf, addresses, {limit = 50} = {}) => {
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) {
        limit = 50
    }
    const addressIn = "address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        // The cluster CTE binds its own copy of the wallet addresses, ahead of
        // the ones MaxFollows takes below.
        FollowedCluster("memo_follows." + addressIn) +
        "SELECT " +
        "   memo_follows.follow_address," +
        "   memo_follows.tx_hash," +
        "   memo_follows.unfollow, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data, " +
        "   max_follows.timestamp, " +
        "   last_posts.timestamp AS last_activity " +
        "FROM memo_follows " +
        "JOIN (" + MaxFollows(addressIn) + ") max_follows ON (max_follows.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN (" + LastClusterPosts + ") last_posts ON (last_posts.address = memo_follows.follow_address) " +
        "LEFT JOIN profiles ON (profiles.address = memo_follows.follow_address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE max_follows.unfollow = 0 " +
        // Never-active follows have a NULL activity time, which SQLite sorts
        // last under DESC - the limit keeps the most recently active instead.
        "ORDER BY last_activity DESC, max_follows.timestamp DESC " +
        (limit === null ? "" : "LIMIT ? ")
    const variables = [...addresses, ...addresses].concat(limit === null ? [] : limit)
    return await Select(conf, "memo_follows-following", query, variables)
}

const GetFollowers = async (conf, addresses) => {
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
    return await Select(conf, "memo_follows-followers", query, addresses)
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
