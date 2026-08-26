// The status bar's utxo counting, in commonjs so node's test runner can
// require it directly - the pattern router_core and selector_core set.
const {SlpDecided} = require("../../util/tx_build")

// Counts what the status bar reports: coins the builders will actually spend,
// and token or baton coins the wallet actually holds. A token row counts only
// when the index calls its transaction VALID - the same rule the token
// balance queries and the signer apply - so the count can never claim tokens
// the Tokens tab shows no balance for. An INVALID row's annotation carries
// nothing on chain, and an undecided one may still settle either way; neither
// is inventory, and neither is a spendable coin (the builders refuse token
// rows regardless of verdict).
const CountUtxos = (coins, spendableAddresses) => {
    let spendableUtxos = 0
    let tokenUtxos = 0
    for (let i = 0; i < coins.length; i++) {
        if (coins[i].slp_token_hash || coins[i].slp_baton_token_hash) {
            if (coins[i].slp_validity === "VALID") {
                tokenUtxos++
            }
        } else if (spendableAddresses.includes(coins[i].address) && SlpDecided(coins[i])) {
            // A coin whose transaction the index hasn't decided SLP-wise is
            // one the builders refuse, so it isn't counted as spendable.
            spendableUtxos++
        }
    }
    return {spendableUtxos, tokenUtxos}
}

module.exports = {
    CountUtxos,
}
