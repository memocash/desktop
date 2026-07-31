// The database schema, shared by the sqlite worker that creates it and by
// tests that build a fixture database from the same definitions.

const Definitions = [
    `txs (
        hash CHAR,
        UNIQUE(hash)
    )`,
    `tx_seens (
        hash CHAR,
        timestamp CHAR,
        UNIQUE(hash)
    )`,
    `tx_raws (
        hash CHAR,
        raw BLOB,
        UNIQUE(hash)
    )`,
    `inputs (
        hash CHAR,
        \`index\` INT,
        prev_hash CHAR,
        prev_index INT,
        UNIQUE(hash, \`index\`)
    )`,
    `outputs (
        hash CHAR,
        \`index\` INT,
        address CHAR,
        value INT,
        script BLOB,
        UNIQUE(hash, \`index\`)
    )`,
    `blocks (
        hash CHAR,
        timestamp CHAR,
        height INT,
        UNIQUE(hash)
    )`,
    `block_txs (
        block_hash CHAR,
        tx_hash CHAR,
        UNIQUE(block_hash, tx_hash)
    )`,
    // Where the history sync left off for each address. Deliberately not
    // seeded for databases that predate it: an address with no row here syncs
    // from its first transaction again, which is what fills in the gaps the
    // old block-timestamp cursor skipped past. Filling this in from saved
    // transactions would keep those gaps, since the newest transaction a
    // database happens to hold isn't the one the sync last reached.
    `address_syncs (
        address CHAR,
        seen CHAR,
        tx_hash CHAR,
        UNIQUE(address)
    )`,
    `history (
        address CHAR,
        hash CHAR,
        value INT,
        height INT,
        timestamp CHAR,
        UNIQUE(address, hash)
    )`,
    `profiles (
        address CHAR,
        name CHAR,
        profile CHAR,
        pic CHAR,
        UNIQUE(address)
    )`,
    `profile_names (
        address CHAR,
        name CHAR,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `profile_texts (
        address CHAR,
        profile CHAR,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `profile_pics (
        address CHAR,
        pic CHAR,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `images (
        url CHAR,
        data BLOB,
        UNIQUE(url)
    )`,
    `memo_follows (
        address CHAR,
        follow_address CHAR,
        unfollow INT,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `memo_posts (
        address CHAR,
        text CHAR,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `memo_likes (
        address CHAR,
        like_tx_hash CHAR,
        post_tx_hash CHAR,
        tip INT,
        UNIQUE(like_tx_hash)
    )`,
    `memo_replies (
        parent_tx_hash CHAR,
        child_tx_hash CHAR,
        UNIQUE(parent_tx_hash, child_tx_hash)
    )`,
    `memo_chat_post (
        tx_hash CHAR,
        room CHAR,
        UNIQUE(tx_hash)
    )`,
    `memo_chat_follow (
        address CHAR,
        room CHAR,
        unfollow INT,
        tx_hash CHAR,
        UNIQUE(tx_hash)
    )`,
    `slp_outputs (
        hash CHAR,
        \`index\` INT,
        token_hash CHAR,
        amount INT,
        UNIQUE(hash, \`index\`)
    )`,
    `slp_batons (
        hash CHAR,
        \`index\` INT,
        token_hash CHAR,
        UNIQUE(hash, \`index\`)
    )`,
    `slp_geneses (
        hash CHAR,
        token_type INT,
        decimals INT,
        ticker CHAR,
        name CHAR,
        doc_url CHAR,
        UNIQUE(hash)
    )`,
    `slp_checks (
        hash CHAR,
        UNIQUE(hash)
    )`,
    `link_requests (
        tx_hash CHAR,
        address CHAR,
        parent_address CHAR,
        message CHAR,
        UNIQUE(tx_hash)
    )`,
    `link_accepts (
        tx_hash CHAR,
        request_tx_hash CHAR,
        message CHAR,
        UNIQUE(tx_hash)
    )`,
    `link_revokes (
        tx_hash CHAR,
        accept_tx_hash CHAR,
        message CHAR,
        UNIQUE(tx_hash)
    )`,
    `address_aliases (
        tx_hash CHAR,
        address CHAR,
        target_address CHAR,
        alias CHAR,
        UNIQUE(tx_hash)
    )`,
]

// These columns are joined/filtered on constantly (wallet balance, post lists,
// follow lists) but aren't covered by the UNIQUE constraints above, which only
// index their own leading columns. Without these, every one of those queries
// does a full table scan, and since better-sqlite3 runs synchronously in a
// single worker thread, a slow scan stalls every other pending DB call behind it.
const Indexes = [
    "CREATE INDEX IF NOT EXISTS idx_outputs_address ON outputs (address)",
    "CREATE INDEX IF NOT EXISTS idx_inputs_prev ON inputs (prev_hash, prev_index)",
    "CREATE INDEX IF NOT EXISTS idx_block_txs_tx_hash ON block_txs (tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_memo_likes_post_tx_hash ON memo_likes (post_tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_memo_replies_child_tx_hash ON memo_replies (child_tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_memo_posts_address ON memo_posts (address)",
    "CREATE INDEX IF NOT EXISTS idx_memo_follows_address ON memo_follows (address)",
    "CREATE INDEX IF NOT EXISTS idx_memo_follows_follow_address ON memo_follows (follow_address)",
    "CREATE INDEX IF NOT EXISTS idx_memo_chat_follow_address ON memo_chat_follow (address)",
    "CREATE INDEX IF NOT EXISTS idx_link_accepts_request_tx_hash ON link_accepts (request_tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_link_revokes_accept_tx_hash ON link_revokes (accept_tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_address_aliases_target ON address_aliases (target_address)",
]

// Run after the tables exist, on every open, in place of a migration mechanism.
//
// Cached pics used to be whatever the pic URL returned, with no check that it
// was an image. Dead image hosts overwhelmingly answer with a 200 and an HTML
// page rather than a 404 - imgur serves its homepage - so those databases hold
// rows of markup that render as a permanently broken image: the row exists, so
// the downloader skips the URL forever and the render sites see a non-empty
// blob and never fall back to the default pic. Dropping them lets the download
// happen once more, now checked (see client/images.js).
//
// The length(data) > 0 guard is what stops this from re-downloading dead URLs
// on every launch: a URL that comes back as a non-image is re-saved as an empty
// blob, deliberately, as a tombstone meaning "asked, it isn't an image, don't
// ask again", and this must leave those alone.
const Cleanups = [
    "DELETE FROM images " +
    "WHERE length(data) > 0 " +
    "AND hex(substr(data, 1, 4)) != '89504E47' " +          // png
    "AND hex(substr(data, 1, 3)) != 'FFD8FF' " +            // jpeg
    "AND hex(substr(data, 1, 4)) != '47494638' " +          // gif
    "AND hex(substr(data, 1, 2)) != '424D' " +              // bmp
    "AND NOT (hex(substr(data, 1, 4)) = '52494646' " +      // webp
    "   AND hex(substr(data, 9, 4)) = '57454250')",
]

module.exports = {
    Definitions,
    Indexes,
    Cleanups,
}
