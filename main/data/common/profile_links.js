const txTimestamp = (hash) => "COALESCE(" +
    "(SELECT MIN(blocks.timestamp) FROM block_txs JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
    "WHERE block_txs.tx_hash = " + hash + "), " +
    "(SELECT tx_seens.timestamp FROM tx_seens WHERE tx_seens.hash = " + hash + "))"

// Records on a revoked child address remain part of its linked identity only
// when they predate the revoke. A later active acceptance removes that cutoff.
const historicallyValid = (address, txHash) => "NOT EXISTS (" +
    "SELECT 1 FROM link_requests cutoff_request " +
    "JOIN link_accepts cutoff_accept ON (cutoff_accept.request_tx_hash = cutoff_request.tx_hash) " +
    "JOIN link_revokes cutoff_revoke ON (cutoff_revoke.accept_tx_hash = cutoff_accept.tx_hash) " +
    "WHERE cutoff_request.address = " + address + " " +
    "AND NOT EXISTS (" +
    "   SELECT 1 FROM link_accepts active_accept " +
    "   LEFT JOIN link_revokes active_revoke ON (active_revoke.accept_tx_hash = active_accept.tx_hash) " +
    "   WHERE active_accept.request_tx_hash = cutoff_request.tx_hash " +
    "   AND active_revoke.tx_hash IS NULL" +
    ") " +
    "AND " + txTimestamp(txHash) + " > " + txTimestamp("cutoff_revoke.tx_hash") +
    ")"

module.exports = {
    historicallyValid,
    txTimestamp,
}
