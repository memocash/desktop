const {Select} = require("../sqlite")

const placeholders = (values) => Array(values.length).fill("?").join(", ")

// User-relevant activity assembled from the wallet cache. Incoming payments
// exclude transactions spending one of our own outputs, which filters change.
const GetNotifications = async (conf, addresses) => {
    if (!addresses || !addresses.length) {
        return []
    }
    const own = placeholders(addresses)
    const timestamp = (hash) => "MIN(COALESCE((SELECT blocks.timestamp FROM block_txs " +
        "JOIN blocks ON blocks.hash = block_txs.block_hash WHERE block_txs.tx_hash = " + hash + " LIMIT 1), " +
        "(SELECT timestamp FROM tx_seens WHERE hash = " + hash + ")), " +
        "COALESCE((SELECT timestamp FROM tx_seens WHERE hash = " + hash + "), " +
        "(SELECT blocks.timestamp FROM block_txs JOIN blocks ON blocks.hash = block_txs.block_hash " +
        "WHERE block_txs.tx_hash = " + hash + " LIMIT 1)))"
    const actorName = (address) => "COALESCE((SELECT profile_names.name FROM profiles " +
        "JOIN profile_names ON profile_names.tx_hash = profiles.name WHERE profiles.address = " + address + "), " +
        "SUBSTR(" + address + ", 1, 12) || '…')"

    const queries = [
        {
            sql: "SELECT 'coin' AS type, outputs.hash AS tx_hash, NULL AS actor_address, NULL AS actor_name, " +
                "NULL AS post_tx_hash, NULL AS text, SUM(outputs.value) AS amount, NULL AS token_hash, " +
                "NULL AS ticker, NULL AS decimals, " + timestamp("outputs.hash") + " AS timestamp " +
                "FROM outputs LEFT JOIN slp_outputs ON slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index` " +
                "WHERE outputs.address IN (" + own + ") AND slp_outputs.hash IS NULL " +
                "AND NOT EXISTS (SELECT 1 FROM inputs JOIN outputs spent ON spent.hash = inputs.prev_hash " +
                "AND spent.`index` = inputs.prev_index WHERE inputs.hash = outputs.hash AND spent.address IN (" + own + ")) " +
                "GROUP BY outputs.hash HAVING SUM(outputs.value) > 0",
            params: [...addresses, ...addresses],
        },
        {
            sql: "SELECT 'token' AS type, outputs.hash AS tx_hash, NULL AS actor_address, NULL AS actor_name, " +
                "NULL AS post_tx_hash, NULL AS text, SUM(slp_outputs.amount) AS amount, slp_outputs.token_hash, " +
                "slp_geneses.ticker, slp_geneses.decimals, " + timestamp("outputs.hash") + " AS timestamp " +
                "FROM outputs JOIN slp_outputs ON slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index` " +
                "LEFT JOIN slp_geneses ON slp_geneses.hash = slp_outputs.token_hash " +
                "WHERE outputs.address IN (" + own + ") AND NOT EXISTS (SELECT 1 FROM inputs " +
                "JOIN outputs spent ON spent.hash = inputs.prev_hash AND spent.`index` = inputs.prev_index " +
                "WHERE inputs.hash = outputs.hash AND spent.address IN (" + own + ")) " +
                "GROUP BY outputs.hash, slp_outputs.token_hash",
            params: [...addresses, ...addresses],
        },
        {
            sql: "SELECT 'reply' AS type, child.tx_hash, child.address AS actor_address, " + actorName("child.address") +
                " AS actor_name, parent.tx_hash AS post_tx_hash, child.text, NULL AS amount, NULL AS token_hash, " +
                "NULL AS ticker, NULL AS decimals, " + timestamp("child.tx_hash") + " AS timestamp " +
                "FROM memo_replies JOIN memo_posts parent ON parent.tx_hash = memo_replies.parent_tx_hash " +
                "JOIN memo_posts child ON child.tx_hash = memo_replies.child_tx_hash " +
                "WHERE parent.address IN (" + own + ") AND child.address NOT IN (" + own + ")",
            params: [...addresses, ...addresses],
        },
        {
            sql: "SELECT 'like' AS type, memo_likes.like_tx_hash AS tx_hash, memo_likes.address AS actor_address, " +
                actorName("memo_likes.address") + " AS actor_name, memo_posts.tx_hash AS post_tx_hash, memo_posts.text, " +
                "memo_likes.tip AS amount, NULL AS token_hash, NULL AS ticker, NULL AS decimals, " +
                timestamp("memo_likes.like_tx_hash") + " AS timestamp FROM memo_likes " +
                "JOIN memo_posts ON memo_posts.tx_hash = memo_likes.post_tx_hash " +
                "WHERE memo_posts.address IN (" + own + ") AND memo_likes.address NOT IN (" + own + ")",
            params: [...addresses, ...addresses],
        },
        {
            sql: "SELECT 'link_request' AS type, link_requests.tx_hash, link_requests.address AS actor_address, " +
                actorName("link_requests.address") + " AS actor_name, NULL AS post_tx_hash, link_requests.message AS text, " +
                "NULL AS amount, NULL AS token_hash, NULL AS ticker, NULL AS decimals, " +
                timestamp("link_requests.tx_hash") + " AS timestamp FROM link_requests " +
                "WHERE link_requests.parent_address IN (" + own + ") AND link_requests.address NOT IN (" + own + ")",
            params: [...addresses, ...addresses],
        },
        {
            sql: "SELECT 'link_accept' AS type, link_accepts.tx_hash, link_accepts.address AS actor_address, " +
                actorName("link_accepts.address") + " AS actor_name, NULL AS post_tx_hash, link_accepts.message AS text, " +
                "NULL AS amount, NULL AS token_hash, NULL AS ticker, NULL AS decimals, " +
                timestamp("link_accepts.tx_hash") + " AS timestamp FROM link_accepts " +
                "JOIN link_requests ON link_requests.tx_hash = link_accepts.request_tx_hash " +
                "WHERE link_requests.address IN (" + own + ") AND link_accepts.address NOT IN (" + own + ")",
            params: [...addresses, ...addresses],
        },
    ]
    const sql = queries.map(query => query.sql).join(" UNION ALL ") +
        " ORDER BY timestamp DESC LIMIT 100"
    return Select(conf, "notifications", sql, queries.map(query => query.params).flat())
}

module.exports = {GetNotifications}
