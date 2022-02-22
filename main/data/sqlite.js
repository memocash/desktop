const database = require("better-sqlite3")
const homedir = require('os').homedir()

let _db

const GetDb = () => {
    if (_db === undefined) {
        _db = database(homedir + "/.memo/memo.db")
        const create = _db.prepare("CREATE TABLE IF NOT EXISTS txs (hash CHAR)")
        create.run()
    }
    return _db
}

const Insert = async (query, variables) => {
    const insert = GetDb().prepare(query)
    await insert.run(...variables)
}

module.exports = {
    Insert,
    GetDb,
}
