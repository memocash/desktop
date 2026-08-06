const {Insert, InsertBatch, Select} = require("../sqlite")
const {KeepFirst, KeepLast, Rows, Statements} = require("../common/rows")
const {txJoinTimestamp} = require("../common/profile_links")
const {AddSlpOutput, SlpAmount, SlpRows} = require("./slp")

// Writes a whole page of downloaded transactions as one batch of multi-row
// inserts. A history page holds up to 1000 transactions per address across
// every address of the wallet, and each transaction fills a row in eight or so
// tables - as individual statements that was tens of thousands of worker round
// trips per page, which cost far more than the inserts themselves.
const SaveTransactions = async (conf, transactions) => {
    if (!transactions || !transactions.length) {
        return
    }
    const slp = SlpRows()
    const tables = {
        txs: Rows("INSERT OR IGNORE INTO txs (hash)", KeepFirst),
        seens: Rows("INSERT OR IGNORE INTO tx_seens (hash, timestamp)", KeepFirst),
        raws: Rows("INSERT OR IGNORE INTO tx_raws (hash, raw)", KeepFirst),
        inputs: Rows("INSERT OR IGNORE INTO inputs (hash, `index`, prev_hash, prev_index)", KeepFirst),
        outputs: Rows("INSERT OR REPLACE INTO outputs (hash, `index`, address, value, script)", KeepLast),
        checks: Rows("INSERT OR IGNORE INTO slp_checks (hash)", KeepFirst),
        blocks: Rows("INSERT OR IGNORE INTO blocks (hash, timestamp, height)", KeepFirst),
        blockTxs: Rows("INSERT OR IGNORE INTO block_txs (block_hash, tx_hash)", KeepFirst),
    }
    for (let i = 0; i < transactions.length; i++) {
        if (transactions[i] === undefined) {
            continue
        }
        const hash = transactions[i].hash
        tables.txs.add(hash, [hash])
        if (transactions[i].seen && transactions[i].seen.substr(0, 2) === "20") {
            tables.seens.add(hash, [hash, transactions[i].seen])
        }
        // Callers may pass a trimmed tx (just hash/seen, e.g. for timestamp-only
        // sync) without raw/inputs/outputs/blocks - skip those sections rather
        // than crash on the missing fields.
        if (transactions[i].raw !== undefined) {
            tables.raws.add(hash, [hash, Buffer.from(transactions[i].raw, "hex")])
        }
        for (let j = 0; j < (transactions[i].inputs || []).length; j++) {
            const input = transactions[i].inputs[j]
            tables.inputs.add(hash + "-" + input.index, [hash, input.index, input.prev_hash, input.prev_index])
        }
        for (let j = 0; j < (transactions[i].outputs || []).length; j++) {
            const output = transactions[i].outputs[j]
            tables.outputs.add(hash + "-" + output.index, [
                hash, output.index, output.lock ? output.lock.address : "unknown", output.amount,
                Buffer.from(output.script, "hex")])
            AddSlpOutput(slp, hash, output)
        }
        if (transactions[i].outputs && transactions[i].outputs.length) {
            // Sync queries include SLP fields on outputs, so this tx doesn't
            // need the SLP backfill check.
            tables.checks.add(hash, [hash])
        }
        if (!transactions[i].blocks) {
            continue
        }
        for (let j = 0; j < transactions[i].blocks.length; j++) {
            const block = transactions[i].blocks[j].block
            tables.blocks.add(block.hash, [block.hash, block.timestamp, block.height])
            tables.blockTxs.add(block.hash + "-" + hash, [block.hash, hash])
        }
    }
    await InsertBatch(conf, "txs", [...Statements(tables), ...Statements(slp)])
}

const SaveBlock = async (conf, block) => {
    if (!block) {
        return
    }
    await Insert(conf, "blocks", "INSERT OR IGNORE INTO blocks (hash, timestamp, height) VALUES (?, ?, ?)", [
        block.hash, block.timestamp, block.height])
}

const GetTransactions = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   hash, " +
        "   timestamp, " +
        "   height, " +
        "   COALESCE((SELECT MAX(height)+1 FROM blocks) - height, 0) AS confirms, " +
        "   SUM(value) AS value " +
        "FROM history " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY hash " +
        "ORDER BY timestamp DESC"
    return Select(conf, "history", query, addresses)
}

const GenerateHistory = async (conf, addresses) => {
    await Insert(conf, "history",
        "INSERT OR REPLACE INTO history (address, hash, timestamp, height, value) " +
        "SELECT " +
        "   outputs.address, " +
        "   txs.hash AS hash, " +
        "   " + txJoinTimestamp + " AS timestamp, " +
        "   MIN(blocks.height) AS height, " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN 0 ELSE outputs.value END) - " +
        "   SUM(CASE WHEN inputs.hash = txs.hash THEN outputs.value ELSE 0 END) AS value " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "JOIN txs ON (outputs.hash = txs.hash OR inputs.hash = txs.hash) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = txs.hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = txs.hash) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY outputs.address, txs.hash " +
        "ORDER BY " + txJoinTimestamp + " DESC" +
        "", addresses)
}

const GetWalletInfo = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.address, " +
        "   COUNT(DISTINCT (outputs.hash || outputs.`index`)) AS output_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN 1 ELSE 0 END), 0) AS utxo_count, " +
        "   IFNULL(SUM(CASE WHEN inputs.hash IS NULL THEN outputs.value ELSE 0 END), 0) AS balance " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY outputs.address "
    return Select(conf, "outputs-wallet-info", query, addresses)
}

// The index returns an address's transactions in the order it first saw them
// and pages on that same order: seen time, then the tx hash in the internal
// (reversed) byte order it stores hashes in. Comparing the display hash instead
// puts same-second transactions in the wrong order at a page boundary.
const ReverseHash = (hash) => (hash.match(/../g) || []).reverse().join("")

const CompareSyncs = (a, b) => {
    if (a.seen !== b.seen) {
        return a.seen < b.seen ? -1 : 1
    }
    const aHash = ReverseHash(a.tx_hash), bHash = ReverseHash(b.tx_hash)
    return aHash === bHash ? 0 : (aHash < bHash ? -1 : 1)
}

const MaxSync = (address, txs) => {
    let max
    for (let i = 0; i < (txs || []).length; i++) {
        // SaveTransactions only keeps a seen timestamp that starts with "20",
        // and the index sorts anything else to the front of the address, so a
        // transaction without one can't be resumed from.
        if (!txs[i].seen || txs[i].seen.substr(0, 2) !== "20") {
            continue
        }
        const sync = {address, seen: txs[i].seen, tx_hash: txs[i].hash}
        if (max === undefined || CompareSyncs(sync, max) > 0) {
            max = sync
        }
    }
    return max
}

const GetAddressSyncs = async (conf, addresses) => {
    const query = "" +
        "SELECT address, seen, tx_hash " +
        "FROM address_syncs " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ")"
    return Select(conf, "address_syncs", query, addresses)
}

// How far the history sync has walked an address, stored as the last
// transaction it actually reached rather than a time derived from the
// transactions it saved. A block's timestamp is later than the seen time of the
// transactions in it, so resuming from a block timestamp (or from the newest
// transaction some other sync happened to save) skips every transaction the
// index saw in between, and those gaps are permanent: an unfetched transaction
// that spends a wallet output leaves that output looking unspent forever.
const SaveAddressSync = async (conf, address, txs) => {
    const existing = (await Select(conf, "address_syncs",
        "SELECT address, seen, tx_hash FROM address_syncs WHERE address = ?", [address]))[0]
    const sync = MaxSync(address, txs)
    if (!sync || (existing && CompareSyncs(sync, existing) <= 0)) {
        return existing
    }
    await Insert(conf, "address_syncs", "INSERT OR REPLACE INTO address_syncs (address, seen, tx_hash) VALUES (?, ?, ?)", [
        sync.address, sync.seen, sync.tx_hash])
    return sync
}

const GetTransaction = async (conf, txHash) => {
    const outputs = await Select(conf, "transaction-outputs", "SELECT * FROM outputs WHERE hash = ? ORDER BY `index`", [txHash])
    const inputs = await Select(conf, "transaction-inputs", "SELECT * FROM inputs WHERE hash = ?", [txHash])
    if (inputs.length > 0) {
        let inputOutputsWhere = []
        let inputOutputsParams = []
        for (let i = 0; i < inputs.length; i++) {
            inputOutputsWhere.push("hash = ? AND `index` = ?")
            inputOutputsParams.push(inputs[i].prev_hash, inputs[i].prev_index)
        }
        const inputOutputs = await Select(conf, "transaction-input-outputs", "SELECT * FROM outputs WHERE (" + inputOutputsWhere.join(") OR (") + ")",
            inputOutputsParams)
        for (let i = 0; i < inputs.length; i++) {
            for (let j = 0; j < inputOutputs.length; j++) {
                if (inputOutputs[j].hash === inputs[i].prev_hash && inputOutputs[j].index === inputs[i].prev_index) {
                    inputs[i].output = inputOutputs[j]
                    break
                }
            }
        }
    }
    const seens = await Select(conf, "tx_seens", "SELECT * FROM tx_seens WHERE hash = ?", [txHash])
    let seen
    if (seens && seens.length) {
        seen = seens[0]
    }
    const raws = await Select(conf, "tx_raws", "SELECT * FROM tx_raws WHERE hash = ?", [txHash])
    let raw
    if (raws && raws.length) {
        raw = raws[0].raw
    }
    let block
    try {
        const blockTxs = await Select(conf, "block_txs", "SELECT * FROM block_txs WHERE tx_hash = ?", [txHash])
        const blocks = await Select(conf, "blocks", "SELECT * FROM blocks WHERE hash = ?", [blockTxs[0].block_hash])
        block = blocks[0]
        const maxBlock = await Select(conf, "blocks-max", "SELECT * FROM blocks ORDER BY height DESC LIMIT 1")
        block.confirmations = maxBlock[0].height - block.height
    } catch (e) {
    }
    return {outputs, inputs, seen, block, raw}
}

// The stored amount is signed 64-bit two's-complement; the on-chain uint64
// every caller works with comes back through SlpAmount.
const decodeSlpAmount = (row) => {
    if (row && row.slp_amount != null) {
        row.slp_amount = SlpAmount(row.slp_amount)
    }
    return row
}

const GetOutput = async (conf, txHash, outputIndex) =>
    decodeSlpAmount((await Select(conf, "transaction-output",
        "SELECT outputs.*, slp_outputs.token_hash AS slp_token_hash, " +
        "slp_outputs.amount AS slp_amount, slp_batons.token_hash AS slp_baton_token_hash, " +
        "slp_geneses.token_type AS slp_token_type " +
        "FROM outputs " +
        "LEFT JOIN slp_outputs ON slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index` " +
        "LEFT JOIN slp_batons ON slp_batons.hash = outputs.hash AND slp_batons.`index` = outputs.`index` " +
        "LEFT JOIN slp_geneses ON slp_geneses.hash = COALESCE(slp_outputs.token_hash, slp_batons.token_hash) " +
        "WHERE outputs.hash = ? AND outputs.`index` = ? LIMIT 1",
        [txHash, outputIndex]))[0])

const GetUtxos = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.*, " +
        "   slp_outputs.token_hash AS slp_token_hash, " +
        "   slp_outputs.amount AS slp_amount, " +
        "   slp_batons.token_hash AS slp_baton_token_hash " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "LEFT JOIN slp_outputs ON (slp_outputs.hash = outputs.hash AND slp_outputs.`index` = outputs.`index`) " +
        "LEFT JOIN slp_batons ON (slp_batons.hash = outputs.hash AND slp_batons.`index` = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL"
    return (await Select(conf, "outputs-utxos", query, addresses)).map(decodeSlpAmount)
}

module.exports = {
    GenerateHistory,
    GetAddressSyncs,
    GetTransaction,
    GetOutput,
    GetTransactions,
    GetUtxos,
    GetWalletInfo,
    SaveAddressSync,
    SaveBlock,
    SaveTransactions,
}
