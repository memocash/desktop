// Runs operations that share a name one after another.
//
// Being single-threaded is not the same as being atomic: anything that awaits
// gives every other pending operation a turn, so a check and the write that
// depends on it can be separated by an arbitrary amount of other work. A spend
// budget read before a confirmation dialog and charged after it is exactly that
// shape - two sends can both be told there is room, because neither has been
// charged yet when the other asks.
//
// Named rather than global so unrelated work doesn't queue behind a dialog
// somebody left open.
const queues = new Map()

const Serialize = (name, run) => {
    const previous = queues.get(name) || Promise.resolve()
    // Both settlements continue the chain: one operation failing must not stop
    // the next from running, and must not leave the queue holding a rejected
    // promise nobody handles.
    const next = previous.then(run, run)
    const tail = next.then(() => {}, () => {})
    queues.set(name, tail)
    // A name with nothing left to run is forgotten, rather than kept for the
    // life of the process along with whatever it was named after - a wallet path
    // or a window that has since closed. Only the operation that is still the
    // tail may do the forgetting: anything queued behind it has already replaced
    // the entry, and deleting that would let the next arrival start alongside
    // work that is still running. Attached to the operation rather than to the
    // tail, so the release happens as soon as the work is over.
    const release = () => {
        if (queues.get(name) === tail) {
            queues.delete(name)
        }
    }
    next.then(release, release)
    return next
}

// For tests, which need to see that a finished queue is let go rather than take
// it on trust.
const QueuedNames = () => [...queues.keys()]

module.exports = {QueuedNames, Serialize}
