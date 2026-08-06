const {InsertBatch, Select} = require("../sqlite")
const {KeepFirst, KeepLast, Rows, Statements} = require("../common/rows")

// Token amounts are uint64 on chain and arrive as a number or - past 2^53 - a
// BigInt (see the exact parse in client/graphql.js). sqlite's INTEGER is a
// signed 64-bit, so the top half of the range is stored as its two's-complement
// negative and read back through SlpAmount below. Exact both ways, with no
// string column and no float anywhere in between.
const wrapAmount = (amount) => BigInt.asIntN(64, BigInt(amount))

// The stored two's-complement back to the on-chain amount. Always a BigInt, so
// a token amount has one shape everywhere instead of changing type at 2^53;
// null and undefined pass through for outputs that carry no tokens.
const SlpAmount = (stored) => stored == null ? stored : BigInt.asUintN(64, BigInt(stored))

// The SLP tables an output writes to. Transaction saves build these alongside
// their own tables so an output's SLP rows ride along in the same batch.
const SlpRows = () => ({
    outputs: Rows("INSERT OR IGNORE INTO slp_outputs (hash, `index`, token_hash, amount)", KeepFirst),
    batons: Rows("INSERT OR IGNORE INTO slp_batons (hash, `index`, token_hash)", KeepFirst),
    geneses: Rows("INSERT OR REPLACE INTO slp_geneses " +
        "(hash, token_type, decimals, ticker, name, doc_url)", KeepLast),
})

const AddSlpOutput = (rows, hash, output) => {
    if (output.slp) {
        rows.outputs.add(hash + "-" + output.index,
            [hash, output.index, output.slp.token_hash, wrapAmount(output.slp.amount)])
        AddSlpGenesis(rows, output.slp.genesis)
    }
    if (output.slp_baton) {
        rows.batons.add(hash + "-" + output.index, [hash, output.index, output.slp_baton.token_hash])
        AddSlpGenesis(rows, output.slp_baton.genesis)
    }
}

const AddSlpGenesis = (rows, genesis) => {
    if (!genesis) {
        return
    }
    rows.geneses.add(genesis.hash, [
        genesis.hash, genesis.token_type, genesis.decimals, genesis.ticker, genesis.name, genesis.doc_url])
}

// Saves SLP data from backfill tx queries (trimmed txs with just hash and
// outputs' SLP fields) and marks the txs checked. Doesn't touch the outputs
// table, so it can't clobber rows saved by full transaction syncs.
const SaveSlp = async (conf, txs) => {
    const rows = SlpRows()
    const checks = Rows("INSERT OR IGNORE INTO slp_checks (hash)", KeepFirst)
    for (let i = 0; i < txs.length; i++) {
        if (!txs[i]) {
            continue
        }
        for (let j = 0; j < (txs[i].outputs || []).length; j++) {
            AddSlpOutput(rows, txs[i].hash, txs[i].outputs[j])
        }
        checks.add(txs[i].hash, [txs[i].hash])
    }
    await InsertBatch(conf, "slp", [...Statements(rows), ...checks.statements()])
}

// UTXO transactions that haven't been checked against the index server for SLP
// data yet. Used to backfill wallets whose history synced before SLP support.
const GetUncheckedSlpTxs = (conf, addresses) => {
    const query = "" +
        "SELECT DISTINCT outputs.hash " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_checks ON (slp_checks.hash = outputs.hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "AND slp_checks.hash IS NULL "
    return Select(conf, "slp-unchecked-txs", query, addresses)
}

const GetSlpGenesis = async (conf, hash) => {
    const rows = await Select(conf, "slp-genesis", "SELECT * FROM slp_geneses WHERE hash = ?", [hash])
    return rows && rows.length ? rows[0] : undefined
}

// The balances sum in JS rather than in SQL: amounts are stored as signed
// 64-bit two's-complement, which SUM would read as negatives, and a genuine
// total can exceed what SUM's int64 accumulator holds - it answers "integer
// overflow" where a BigInt just keeps counting.
const sumBalances = (rows, keyOf) => {
    const balances = new Map()
    for (const row of rows) {
        const key = keyOf(row)
        const balance = balances.get(key)
        if (balance) {
            balance.amount += SlpAmount(row.amount)
            balance.utxo_count++
        } else {
            balances.set(key, {...row, amount: SlpAmount(row.amount), utxo_count: 1})
        }
    }
    return [...balances.values()]
}

const GetAddressTokenBalances = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.address, " +
        "   slp_outputs.token_hash, " +
        "   slp_geneses.ticker, " +
        "   slp_geneses.name, " +
        "   slp_geneses.decimals, " +
        "   slp_outputs.amount " +
        "FROM outputs " +
        "JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = slp_outputs.token_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL "
    const rows = await Select(conf, "slp-address-token-balances", query, addresses)
    return sumBalances(rows, (row) => row.address + ":" + row.token_hash)
}

// Unspent mint batons held by the wallet, grouped by token. Used to enable
// minting for tokens the wallet controls a baton for, including tokens with no
// token balance (batons live in slp_batons, not slp_outputs).
const GetTokenBatons = (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   slp_batons.token_hash, " +
        "   slp_geneses.ticker, " +
        "   slp_geneses.name, " +
        "   slp_geneses.decimals, " +
        "   slp_geneses.token_type, " +
        "   COUNT(*) AS baton_count " +
        "FROM outputs " +
        "JOIN slp_batons ON (slp_batons.hash = outputs.hash AND slp_batons.`index` = outputs.`index`) " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = slp_batons.token_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY slp_batons.token_hash "
    return Select(conf, "slp-token-batons", query, addresses)
}

const GetTokenBalances = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   slp_outputs.token_hash, " +
        "   slp_geneses.ticker, " +
        "   slp_geneses.name, " +
        "   slp_geneses.decimals, " +
        "   slp_geneses.token_type, " +
        "   slp_outputs.amount " +
        "FROM outputs " +
        "JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = slp_outputs.token_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL "
    const rows = await Select(conf, "slp-token-balances", query, addresses)
    return sumBalances(rows, (row) => row.token_hash)
}

module.exports = {
    GetAddressTokenBalances,
    GetSlpGenesis,
    GetTokenBalances,
    GetTokenBatons,
    GetUncheckedSlpTxs,
    AddSlpOutput,
    SaveSlp,
    SlpAmount,
    SlpRows,
}
