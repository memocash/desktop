// The backfill's answered-or-not decision, in commonjs so node's test runner
// can require it directly - the pattern router_core and status_core set.

// What the SLP backfill saves for one queried transaction. The index's batch
// resolver echoes a hash it does not know as a stub - {hash, slp: null,
// outputs: []}, no error - while a transaction it knows always carries at
// least one output. A stub's null slp is an absence, not a verdict: saving it
// as answered would mark an unknown transaction NOT_SLP and open exactly the
// fail-open hole the validity work closes. So only a tx with outputs is the
// server's answer; anything else is saved in the unanswered shape (no slp
// key), which stores a NULL verdict that stays unspendable and keeps being
// re-asked.
const AnsweredTx = (returned, hash) =>
    returned && returned.outputs && returned.outputs.length ?
        returned : {hash, outputs: []}

module.exports = {
    AnsweredTx,
}
