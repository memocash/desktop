// The in-memory sqlite the sync tests run against: the same swap of the query
// helpers the table tests make, done before any table module destructures
// them, so main's syncs write real rows through the production SQL. Required
// first thing by each test file that wants it.
const {DatabaseSync} = require("node:sqlite")
const {Definitions, Indexes} = require("../data/schema")
const {SafeRow} = require("../data/big_ints")
const sqlite = require("../data/sqlite")

let db
sqlite.Select = async (conf, name, query, variables = []) => {
    const statement = db.prepare(query)
    statement.setReadBigInts(true)
    return statement.all(...variables).map(row => SafeRow({...row}))
}
sqlite.Insert = async (conf, name, query, variables = []) => db.prepare(query).run(...variables)
sqlite.InsertBatch = async (conf, name, statements) => {
    for (const {query, variables = []} of statements) {
        db.prepare(query).run(...variables)
    }
}

const Open = () => {
    db = new DatabaseSync(":memory:")
    for (const statement of Definitions.map(d => "CREATE TABLE IF NOT EXISTS " + d).concat(Indexes)) {
        db.exec(statement)
    }
}

const Close = () => db.close()

const Rows = (table, order = "rowid") =>
    db.prepare("SELECT * FROM " + table + " ORDER BY " + order).all().map(row => ({...row}))

// A graphQL stand-in that answers each call from a queue of responses (a
// function of the request, or a value) and records what it was asked.
const FakeGraphQL = (...responses) => {
    const calls = []
    const graphQL = async (request) => {
        calls.push(request)
        const next = responses.length > 1 ? responses.shift() : responses[0]
        const response = typeof next === "function" ? next(request) : next
        if (response instanceof Error) {
            throw response
        }
        return response
    }
    graphQL.calls = calls
    return graphQL
}

module.exports = {
    Close,
    FakeGraphQL,
    Open,
    Rows,
}
