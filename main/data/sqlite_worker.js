const {parentPort, isMainThread} = require("worker_threads");
const database = require("better-sqlite3")
const homedir = require('os').homedir()

if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async ({action, queryId, query, variables, dbFile}) => {
    switch (action) {
        case "INSERT":
            Insert({queryId, query, variables})
            break
        case "SELECT":
            Select({queryId, query, variables})
            break
        case "SET_DB":
            await SetDb(dbFile)
            break
        default:
            throw new Error(queryId + ": unknown action - " + action)
    }
});

const Insert = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const insert = db.prepare(query)
        const result = await insert.run(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        throw new Error(queryId + ": " + e)
    }
}

const Select = async ({queryId, query, variables}) => {
    try {
        if (variables === undefined) {
            variables = []
        }
        const db = await GetDb()
        const select = db.prepare(query)
        const result = await select.all(...variables)
        parentPort.postMessage({queryId, result});
    } catch (e) {
        throw new Error(queryId + ": " + e)
    }
}

let _db

const GetDb = async () => {
    return _db
}

const SetDb = async (db) => {
    _db = database(db.replace("~", homedir))
    const statements = Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)
    _db.transaction(() => {
        for (const statement of statements) {
            _db.prepare(statement).run()
        }
    })()
}

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
    "CREATE INDEX IF NOT EXISTS idx_memo_follows_address ON memo_follows (address)",
    "CREATE INDEX IF NOT EXISTS idx_memo_follows_follow_address ON memo_follows (follow_address)",
    "CREATE INDEX IF NOT EXISTS idx_memo_chat_follow_address ON memo_chat_follow (address)",
]

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
]
