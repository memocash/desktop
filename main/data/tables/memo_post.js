const {Select} = require("../sqlite");

const GetPosts = async (addresses) => {
    const where = "memo_posts.address IN (" + Array(addresses.length).fill("?").join(", ") + ")"
    return await Select(getSelectQuery({where}), addresses)
}

const GetPost = async (txHash) => {
    const results = await Select(getSelectQuery({where: "memo_posts.tx_hash = ?"}), [txHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const GetPostReplies = async (postTxHash) => {
    const join = "JOIN memo_replies ON (memo_replies.child_tx_hash = memo_posts.tx_hash)"
    const where = "memo_replies.parent_tx_hash = ?"
    return await Select(getSelectQuery({where, join}), [postTxHash])
}

const GetPostParent = async (postTxHash) => {
    const join = "JOIN memo_replies ON (memo_replies.parent_tx_hash = memo_posts.tx_hash)"
    const where = "memo_replies.child_tx_hash = ?"
    const results = await Select(getSelectQuery({where, join}), [postTxHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const getSelectQuery = ({join = "", where}) => {
    return "" +
        "SELECT " +
        "   memo_posts.*, " +
        "   profile_names.name, " +
        "   images.data AS pic, " +
        "   MIN(" +
        "       COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "       COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "   ) AS timestamp, " +
        "   COUNT(DISTINCT memo_likes.like_tx_hash) AS like_count," +
        "   SUM(memo_likes.tip) AS tip_total " +
        "FROM memo_posts " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_posts.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "LEFT JOIN memo_likes ON (memo_likes.post_tx_hash = memo_posts.tx_hash) " +
        join + " " +
        "WHERE " + where + " " +
        "GROUP BY memo_posts.tx_hash " +
        "ORDER BY timestamp DESC " +
        "LIMIT 50 "
}

module.exports = {
    GetPost,
    GetPosts,
    GetPostParent,
    GetPostReplies,
}
