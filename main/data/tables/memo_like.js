const {Select} = require("../sqlite")
const {historicallyValid} = require("../common/profile_links")

const GetLikes = async (conf, postTxHash) => {
    // A like is signed by one address, but the display profile can live on
    // another address in its accepted profile-link cluster. Resolve name and
    // picture independently, preferring the signing address when it has them.
    const linkedLikers = "" +
        "WITH RECURSIVE profile_links(address, linked_address) AS (" +
        "   SELECT link_requests.address, link_requests.parent_address " +
        "   FROM link_requests " +
        "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "   UNION " +
        "   SELECT link_requests.parent_address, link_requests.address " +
        "   FROM link_requests " +
        "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "), linked_liker_addresses(origin, address) AS (" +
        "   SELECT DISTINCT address, address FROM memo_likes " +
        "   UNION " +
        "   SELECT linked_liker_addresses.origin, profile_links.linked_address " +
        "   FROM linked_liker_addresses " +
        "   JOIN profile_links ON (profile_links.address = linked_liker_addresses.address)" +
        ") "
    const name = "(" +
        "SELECT profile_names.name FROM linked_liker_addresses " +
        "JOIN profiles ON (profiles.address = linked_liker_addresses.address) " +
        "JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "WHERE linked_liker_addresses.origin = memo_likes.address " +
        "AND " + historicallyValid("linked_liker_addresses.address", "profile_names.tx_hash") + " " +
        "ORDER BY (linked_liker_addresses.address = memo_likes.address) DESC, " +
        "linked_liker_addresses.address ASC LIMIT 1)"
    const picData = "(" +
        "SELECT images.data FROM linked_liker_addresses " +
        "JOIN profiles ON (profiles.address = linked_liker_addresses.address) " +
        "JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE linked_liker_addresses.origin = memo_likes.address " +
        "AND " + historicallyValid("linked_liker_addresses.address", "profile_pics.tx_hash") + " " +
        "ORDER BY (linked_liker_addresses.address = memo_likes.address) DESC, " +
        "linked_liker_addresses.address ASC LIMIT 1)"
    const query = linkedLikers +
        "SELECT " +
        "   memo_likes.address, " +
        "   memo_likes.like_tx_hash, " +
        "   memo_likes.tip, " +
        "   " + name + " AS name, " +
        "   " + picData + " AS pic_data, " +
        "   MIN(" +
        "       COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "       COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "   ) AS timestamp " +
        "FROM memo_likes " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_likes.like_tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_likes.like_tx_hash) " +
        "WHERE memo_likes.post_tx_hash = ? " +
        "";
    return await Select(conf, "memo_likes", query, [postTxHash])
}

module.exports = {
    GetLikes,
}
