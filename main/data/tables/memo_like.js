const {Select} = require("../sqlite")
const {clusterField, linkedClusterCte, txJoinTimestamp} = require("../common/profile_links")

const GetLikes = async (conf, postTxHash) => {
    // A like is signed by one address, but the display profile can live on
    // another address in its accepted profile-link cluster. Resolve name and
    // picture independently, preferring the signing address when it has them.
    const linkedLikers = linkedClusterCte({
        cluster: "linked_liker_addresses",
        seedSelect: "address, address",
        seedFrom: "memo_likes",
    })
    const name = clusterField({
        cluster: "linked_liker_addresses", origin: "memo_likes.address",
        join: "JOIN profile_names ON (profile_names.tx_hash = profiles.name) ",
        field: "profile_names.name", txHash: "profile_names.tx_hash",
    })
    const picData = clusterField({
        cluster: "linked_liker_addresses", origin: "memo_likes.address",
        join: "JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
            "JOIN images ON (images.url = profile_pics.pic) ",
        field: "images.data", txHash: "profile_pics.tx_hash",
    })
    const query = linkedLikers +
        "SELECT " +
        "   memo_likes.address, " +
        "   memo_likes.like_tx_hash, " +
        "   memo_likes.tip, " +
        "   " + name + " AS name, " +
        "   " + picData + " AS pic_data, " +
        "   " + txJoinTimestamp + " AS timestamp " +
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
