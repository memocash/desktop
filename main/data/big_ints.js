// With readBigInts on, every integer column leaves the database as a BigInt so
// nothing is rounded on the way out. The ones a number holds exactly - which is
// every column except an oversized token amount - go back to the numbers the
// rest of the app has always handled, so only values a number genuinely cannot
// carry surface as BigInts. Shared by the sqlite worker and the test fixtures
// that stand in for it, so the two cannot disagree about what a row looks like.

const MaxSafe = BigInt(Number.MAX_SAFE_INTEGER)

const SafeInteger = (value) =>
    typeof value === "bigint" && value <= MaxSafe && value >= -MaxSafe
        ? Number(value) : value

const SafeRow = (row) => {
    for (const key in row) {
        row[key] = SafeInteger(row[key])
    }
    return row
}

module.exports = {
    SafeInteger,
    SafeRow,
}
