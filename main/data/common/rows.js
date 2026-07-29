const {InsertRows} = require("../sqlite")

// Collects the rows a save writes to one table so they can go out as batched
// multi-row inserts rather than a statement (and a worker round trip) each.
//
// Rows are keyed on the table's UNIQUE columns because the downloaded data
// repeats them heavily: a history page carries the same transaction both as an
// address's own transaction and as the spend of another output, and every
// transaction in a block re-offers that block's row. Which row survives a
// repeated key matches what the conflict clause would have done inserting one
// at a time - OR IGNORE keeps the first offered, OR REPLACE the last - so
// collecting changes nothing about what ends up stored.
const KeepFirst = "first"
const KeepLast = "last"

// prefix is the insert up to VALUES, e.g. "INSERT OR IGNORE INTO txs (hash)".
const Rows = (prefix, keep) => {
    const rows = new Map()
    return {
        add: (key, row) => {
            if (keep === KeepFirst && rows.has(key)) {
                return
            }
            rows.set(key, row)
        },
        statements: () => InsertRows(prefix, [...rows.values()]),
    }
}

// The statements that write every table in a {name: Rows} group, for InsertBatch.
const Statements = (tables) => Object.values(tables).map(rows => rows.statements()).flat()

module.exports = {
    KeepFirst,
    KeepLast,
    Rows,
    Statements,
}
