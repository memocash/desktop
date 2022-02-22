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
    if (variables === undefined) {
        variables = []
    }
    const insert = GetDb().prepare(query)
    await insert.run(...variables)
}

const Select = async (query, variables) => {
    if (variables === undefined) {
        variables = []
    }
    const select = GetDb().prepare(query)
    const results = select.all(...variables)
    return results
}

module.exports = {
    Insert,
    Select,
    GetDb,
}
