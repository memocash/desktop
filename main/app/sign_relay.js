// The bookkeeping behind carrying one window's spend to another window's
// preload and bringing the answer back.
//
// A preview window holds no session key - the key belongs to the document that
// unlocked the wallet - so a spend it cannot authorise is asked of the window
// that can. Main relays and never holds the key. What matters here is that the
// asking window always gets exactly one answer: the caller is left waiting on a
// window, and a window can be closed, reloaded, or fail to answer at all.
//
// Kept apart from the code that talks to Electron so the settling rules can be
// reasoned about - and tested - without windows.

const CreateSignRelay = () => {
    const waiting = new Map()
    let count = 0

    // Registers a request, hands its id to `dispatch`, and resolves when someone
    // answers for it. `release` runs on the way out, whichever way it settles,
    // for whatever the caller attached to the window it is waiting on. A
    // `dispatch` that throws - sending to contents that have just gone - settles
    // immediately rather than leaving the entry behind.
    const Ask = ({owner, dispatch, release, unanswered}) => new Promise((resolve) => {
        const id = ++count
        waiting.set(id, {owner, release, resolve})
        try {
            dispatch(id)
        } catch (e) {
            Abandon(id, unanswered)
        }
    })

    // An answer counts only from the window the request was sent to: nothing
    // else gets to answer for a relay it was not asked about, and nothing gets
    // to answer twice.
    const Answer = ({owner, id, result}) => {
        const pending = waiting.get(id)
        if (!pending || pending.owner !== owner) {
            return false
        }
        return settle(id, result)
    }

    // Whoever was going to answer no longer can - the window closed, or the
    // document holding the listener was replaced by a reload.
    const Abandon = (id, result) => settle(id, result)

    const settle = (id, result) => {
        const pending = waiting.get(id)
        if (!pending) {
            return false
        }
        waiting.delete(id)
        if (typeof pending.release === "function") {
            pending.release()
        }
        pending.resolve(result)
        return true
    }

    // For tests, which need to see that nothing is left waiting rather than take
    // it on trust.
    const Pending = () => waiting.size

    return {Abandon, Answer, Ask, Pending}
}

module.exports = {
    CreateSignRelay,
}
