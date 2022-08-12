const MaxFollows = (where) => {
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
        "GROUP BY address, follow_address "
}

module.exports = {
    MaxFollows,
}
