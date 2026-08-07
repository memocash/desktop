const {txJoinTimestamp} = require("./profile_links")

// The newest follow-or-unfollow row per group, for either follow table.
// groupBy decides whose newest action wins: per address and the other side
// for queries about a single address (e.g. a room's follower list), or per
// the other side alone when the where clause covers a linked-address cluster
// - any of an identity's addresses can follow or unfollow on its behalf, so
// an unfollow from one address supersedes an older follow from another. Bare
// columns (address, unfollow) come from the row the MIN() picks, which is
// the newest follow transaction.
const maxFollowRows = (table, otherColumn, where, groupBy) => {
    return "" +
        "SELECT " +
        "    unfollow, " +
        "    " + table + ".address, " +
        "    " + table + "." + otherColumn + ", " +
        "    SUBSTR(MIN(printf('%07d', 1000000 - COALESCE(height, 1000000)) || " +
        "        " + table + ".tx_hash), 8) AS tx_hash, " +
        "    " + txJoinTimestamp + " AS timestamp " +
        "FROM " + table + " " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = " + table + ".tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = " + table + ".tx_hash) " +
        "WHERE " + where +
        "GROUP BY " + groupBy + " "
}

const MaxFollows = (where, groupBy = "address, follow_address") =>
    maxFollowRows("memo_follows", "follow_address", where, groupBy)

const MaxChatRoomFollows = (where, groupBy = "address, room") =>
    maxFollowRows("memo_chat_follow", "room", where, groupBy)

module.exports = {
    MaxChatRoomFollows,
    MaxFollows,
}
