// Same grouping choice as MaxChatRoomFollows below: per address and
// follow_address for queries about a single address, or per the other side
// alone when the where clause covers a linked-address cluster, so the
// identity's newest follow or unfollow decides - whichever of its addresses
// sent it.
const MaxFollows = (where, groupBy = "address, follow_address") => {
    return "" +
        "SELECT " +
        "    unfollow, " +
        "    memo_follows.address, " +
        "    memo_follows.follow_address, " +
        "    SUBSTR(MIN(printf('%07d', 1000000 - COALESCE(height, 1000000)) || " +
        "        memo_follows.tx_hash), 8) AS tx_hash, " +
        "    MIN(" +
        "        COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "        COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "    ) AS timestamp " +
        "FROM memo_follows " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_follows.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_follows.tx_hash) " +
        "WHERE " + where +
        "GROUP BY " + groupBy + " "
}

// groupBy decides whose newest action wins. Per address and room for queries
// about one address (a room's follower list). Per room alone when the where
// clause covers a linked-address cluster: any of an identity's addresses can
// follow or unfollow a room on its behalf, so an unfollow from one address
// supersedes an older follow from another. Bare columns (address, unfollow)
// come from the row the MIN() picks, which is the newest follow transaction.
const MaxChatRoomFollows = (where, groupBy = "address, room") => {
    return "" +
        "SELECT " +
        "    unfollow, " +
        "    memo_chat_follow.address, " +
        "    memo_chat_follow.room, " +
        "    SUBSTR(MIN(printf('%07d', 1000000 - COALESCE(height, 1000000)) || " +
        "        memo_chat_follow.tx_hash), 8) AS tx_hash, " +
        "    MIN(" +
        "        COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "        COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "    ) AS timestamp " +
        "FROM memo_chat_follow " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_chat_follow.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_chat_follow.tx_hash) " +
        "WHERE " + where +
        "GROUP BY " + groupBy + " "
}

module.exports = {
    MaxChatRoomFollows,
    MaxFollows,
}
