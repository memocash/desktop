const database = require("better-sqlite3")
const homedir = require('os').homedir()

let _db

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
]

const GetDb = async () => {
    if (_db === undefined) {
        _db = database(homedir + "/.memo/memo.db")
        for (let i = 0; i < Definitions.length; i++) {
            const create = _db.prepare("CREATE TABLE IF NOT EXISTS " + Definitions[i])
            await create.run()
        }
    }
    return _db
}

const Insert = async (query, variables) => {
    if (variables === undefined) {
        variables = []
    }
    const db = await GetDb()
    const insert = db.prepare(query)
    await insert.run(...variables)
}

const Select = async (query, variables) => {
    if (variables === undefined) {
        variables = []
    }
    const db = await GetDb()
    const select = db.prepare(query)
    return await select.all(...variables)
}

module.exports = {
    Insert,
    Select,
    GetDb,
}
