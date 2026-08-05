const txTimestamp = (hash) => "COALESCE(" +
    "(SELECT MIN(blocks.timestamp) FROM block_txs JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
    "WHERE block_txs.tx_hash = " + hash + "), " +
    "(SELECT tx_seens.timestamp FROM tx_seens WHERE tx_seens.hash = " + hash + "))"

// The same block-else-seen rule as txTimestamp, in join form for queries that
// already LEFT JOIN blocks and tx_seens: prefer whichever of block/seen is
// earlier, fall back to the other when one is missing. Named once so the
// ordering rule cannot drift between the query sites that inline it.
const txJoinTimestamp = "MIN(" +
    "COALESCE(blocks.timestamp, tx_seens.timestamp), " +
    "COALESCE(tx_seens.timestamp, blocks.timestamp))"

// The accepted-link graph, expanded in both directions so a cluster can be
// walked from any of its members.
const activeProfileLinks = "" +
    "active_profile_links(address, linked_address) AS (" +
    "   SELECT link_requests.address, link_requests.parent_address " +
    "   FROM link_requests " +
    "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
    "   UNION " +
    "   SELECT link_requests.parent_address, link_requests.address " +
    "   FROM link_requests " +
    "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
    ") "

// WITH RECURSIVE prelude shared by the post, like, and follow queries: every
// origin the seed produces plus the transitive members of its linked-address
// cluster, one (origin, address) row each. seedSelect names the origin column
// twice ("address, address") so the seed row is its own cluster member.
const linkedClusterCte = ({cluster, seedSelect, seedFrom, seedWhere = ""}) => "" +
    "WITH RECURSIVE " + activeProfileLinks + ", " +
    cluster + "(origin, address) AS (" +
    "   SELECT DISTINCT " + seedSelect + " " +
    "   FROM " + seedFrom + " " +
    (seedWhere ? "   WHERE " + seedWhere + " " : "") +
    "   UNION " +
    "   SELECT " + cluster + ".origin, active_profile_links.linked_address " +
    "   FROM " + cluster + " " +
    "   JOIN active_profile_links ON (active_profile_links.address = " + cluster + ".address)" +
    ") "

// One profile field for a cluster, preferring the origin address when it has
// the field, then the lowest linked address - the merge rule every profile
// display shares. join supplies the field's table(s); txHash names the
// setting transaction historicallyValid gates on.
const clusterField = ({cluster, origin, join, field, txHash}) => "(" +
    "SELECT " + field + " " +
    "FROM " + cluster + " " +
    "JOIN profiles ON (profiles.address = " + cluster + ".address) " +
    join + " " +
    "WHERE " + cluster + ".origin = " + origin + " " +
    "AND " + historicallyValid(cluster + ".address", txHash) + " " +
    "ORDER BY (" + cluster + ".address = " + origin + ") DESC, " +
    "   " + cluster + ".address ASC " +
    "LIMIT 1" +
    ")"

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
    clusterField,
    historicallyValid,
    linkedClusterCte,
    txJoinTimestamp,
    txTimestamp,
}
