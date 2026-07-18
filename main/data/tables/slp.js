const {Insert, Select} = require("../sqlite")

const SaveSlpOutput = async (conf, hash, output) => {
    if (output.slp) {
        await Insert(conf, "slp_outputs",
            "INSERT OR IGNORE INTO slp_outputs (hash, `index`, token_hash, amount) VALUES (?, ?, ?, ?)", [
                hash, output.index, output.slp.token_hash, output.slp.amount])
        await SaveSlpGenesis(conf, output.slp.genesis)
    }
    if (output.slp_baton) {
        await Insert(conf, "slp_batons",
            "INSERT OR IGNORE INTO slp_batons (hash, `index`, token_hash) VALUES (?, ?, ?)", [
                hash, output.index, output.slp_baton.token_hash])
        await SaveSlpGenesis(conf, output.slp_baton.genesis)
    }
}

const SaveSlpGenesis = async (conf, genesis) => {
    if (!genesis) {
        return
    }
    await Insert(conf, "slp_geneses",
        "INSERT OR REPLACE INTO slp_geneses (hash, token_type, decimals, ticker, name, doc_url) " +
        "VALUES (?, ?, ?, ?, ?, ?)", [
            genesis.hash, genesis.token_type, genesis.decimals, genesis.ticker, genesis.name, genesis.doc_url])
}

// Saves SLP data from backfill tx queries (trimmed txs with just hash and
// outputs' SLP fields) and marks the txs checked. Doesn't touch the outputs
// table, so it can't clobber rows saved by full transaction syncs.
const SaveSlp = async (conf, txs) => {
    for (let i = 0; i < txs.length; i++) {
        if (!txs[i]) {
            continue
        }
        for (let j = 0; j < (txs[i].outputs || []).length; j++) {
            await SaveSlpOutput(conf, txs[i].hash, txs[i].outputs[j])
        }
        await Insert(conf, "slp_checks", "INSERT OR IGNORE INTO slp_checks (hash) VALUES (?)", [txs[i].hash])
    }
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

const GetTokenBalances = (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   slp_outputs.token_hash, " +
        "   slp_geneses.ticker, " +
        "   slp_geneses.name, " +
        "   slp_geneses.decimals, " +
        "   slp_geneses.token_type, " +
        "   SUM(slp_outputs.amount) AS amount, " +
        "   COUNT(*) AS utxo_count " +
        "FROM outputs " +
        "JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_geneses ON (slp_geneses.hash = slp_outputs.token_hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY slp_outputs.token_hash "
    return Select(conf, "slp-token-balances", query, addresses)
}

module.exports = {
    GetTokenBalances,
    GetUncheckedSlpTxs,
    SaveSlp,
    SaveSlpOutput,
}
