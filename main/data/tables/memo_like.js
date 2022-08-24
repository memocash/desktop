const {Select} = require("../sqlite")

const GetLikes = async (conf, postTxHash) => {
    const query = "" +
        "SELECT " +
        "   memo_likes.address, " +
        "   memo_likes.like_tx_hash, " +
        "   memo_likes.tip, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data, " +
        "   MIN(" +
        "       COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "       COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "   ) AS timestamp " +
        "FROM memo_likes " +
        "LEFT JOIN profiles ON (profiles.address = memo_likes.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
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
