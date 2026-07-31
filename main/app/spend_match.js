// Whether what someone was shown before typing their password covers what the
// keys later said the transaction actually pays.
//
// The preview is read with the wallet's public address lists, since nothing can
// be derived until the wallet is decrypted. Signing reads the same transaction
// again with the keys, and this compares the two. Covered means every payment
// the keys found was on screen, at the same amount, carrying the same tokens,
// and for the same fee - the person may have been shown more than really leaves,
// which is theirs to approve, but never less.
//
// A payment the preview did not show is the shape of a compromised renderer
// getting a signature for somewhere else, so it is not signed on the strength of
// the first answer: it goes back to be confirmed against what the keys say.

const identity = ({address, value, tokenAmount, baton}) =>
    JSON.stringify([address || "", value, tokenAmount || "", baton === true])

const CoversSpend = (shown, actual) => {
    if (!shown || shown.fee !== actual.fee) {
        return false
    }
    // Counted rather than set-compared: two payments of the same amount to the
    // same address are two payments, and being shown one of them is not being
    // shown both.
    const remaining = new Map()
    for (const payment of shown.payments) {
        const key = identity(payment)
        remaining.set(key, (remaining.get(key) || 0) + 1)
    }
    return actual.payments.every((payment) => {
        const key = identity(payment)
        const left = remaining.get(key) || 0
        if (!left) {
            return false
        }
        remaining.set(key, left - 1)
        return true
    })
}

module.exports = {
    CoversSpend,
}
