import {useSyncExternalStore} from "react"

// One place every long-running update reports to. The tab strip, the status bar
// and the Log tab all read this store, so work that used to happen invisibly -
// or behind a modal covering the whole window - shows up wherever the user
// happens to be looking, and only the parts of the app actually waiting on
// something say so.
//
// A module singleton rather than a React context because most of the callers
// are plain async functions in components/wallet/update, reached from effects,
// modals and socket handlers alike; threading a prop to all of them would mean
// touching every call site for no gain. Utxos (components/util/utxos) already
// works this way.

// A scope names what a piece of work affects. Tab names (see Tabs) mark the tab
// that shows the result. Profile is the profile modal, which fills in the same
// way but isn't a tab, so it gets a scope of its own - without it a profile
// being opened would light up the Memo tab instead.
const Scopes = {
    Profile: "profile",
}

const Level = {
    Info: "info",
    Error: "error",
}

// Enough to explain a launch without growing unbounded over a session that
// stays open for days.
const MaxEntries = 500

let entries = []
let running = []
// Rebuilt on every change so useSyncExternalStore sees a new identity then and
// only then; both arrays are replaced rather than mutated for the same reason.
let snapshot = {entries, running}
let lastId = 0
const listeners = new Set()

const emit = () => {
    snapshot = {entries, running}
    listeners.forEach(listener => listener())
}

// Newest first: the log reads top-down and the status bar wants entries[0],
// which also means new entries never scroll the Log tab out from under a
// reader.
const addEntry = (message, {scopes = [], level = Level.Info} = {}) => {
    entries = [{id: ++lastId, message, scopes, level, time: new Date()},
        ...entries.slice(0, MaxEntries - 1)]
    emit()
}

const errorMessage = (error) => {
    if (!error) {
        return "unknown error"
    }
    return error.message || String(error)
}

// A one-off action worth recording but with no duration - a transaction
// arriving, a subscription dropping.
const LogActivity = (message, {scopes = [], level = Level.Info} = {}) => addEntry(message, {scopes, level})

const LogActivityError = (message, error, {scopes = []} = {}) =>
    addEntry(`${message}: ${errorMessage(error)}`, {scopes, level: Level.Error})

// Marks work as in progress until the returned handle is ended, which is what
// makes the scope's tab (and the status bar) show as busy. The label is logged
// as it starts, so the log shows work beginning rather than only its result.
const BeginActivity = (label, {scopes = []} = {}) => {
    const id = ++lastId
    running = [...running, {id, label, scopes, started: new Date()}]
    addEntry(label, {scopes})
    let ended = false
    const finish = (message, level) => {
        if (ended) {
            return
        }
        ended = true
        running = running.filter(item => item.id !== id)
        if (message) {
            // addEntry emits for us, and emitting once keeps the removal and
            // the closing message landing in the same render.
            addEntry(message, {scopes, level})
            return
        }
        emit()
    }
    return {
        // Progress within the work, e.g. each page of a paged download.
        log: (message) => addEntry(message, {scopes}),
        end: (message) => finish(message, Level.Info),
        fail: (error) => finish(`${label} failed: ${errorMessage(error)}`, Level.Error),
    }
}

// BeginActivity around an async function, for the common case where the work is
// one awaited block. `done` may be a string or a function of the result, so the
// closing message can carry counts the work only knows once it's finished.
// Failures are logged and rethrown - callers keep whatever error handling they
// already had.
const TrackActivity = async ({start, done, scopes}, fn) => {
    const activity = BeginActivity(start, {scopes})
    try {
        const result = await fn(activity.log)
        activity.end(typeof done === "function" ? done(result) : done)
        return result
    } catch (e) {
        activity.fail(e)
        throw e
    }
}

// Counts read straight out into labels ("Updating 1 profile", "Updating 43
// profiles"), which is what nearly every message here is made of. Grouped,
// because a transaction count on a long-established wallet runs to five figures
// and "Saved 24913 transactions" is a number nobody reads. The plural form is
// only needed for the words that don't just take an s.
const Plural = (count, singular, plural) =>
    `${count.toLocaleString()} ${count === 1 ? singular : (plural || singular + "s")}`

const ClearActivityLog = () => {
    entries = []
    emit()
}

const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const getSnapshot = () => snapshot

// Static export prerenders these components in Node, where there is no activity
// yet; the server snapshot is the same empty store, so the first client render
// matches.
const useActivity = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

// Whether a given tab (or the profile modal) is waiting on something, and the
// label of the most recently started piece of that work - the newest is the
// most informative, since a longer-running phase usually kicked it off.
const useScopeActivity = (scope) => {
    const {running} = useActivity()
    for (let i = running.length - 1; i >= 0; i--) {
        if (running[i].scopes.includes(scope)) {
            return {busy: true, label: running[i].label}
        }
    }
    return {busy: false, label: ""}
}

export {
    BeginActivity,
    ClearActivityLog,
    Level,
    LogActivity,
    LogActivityError,
    Plural,
    Scopes,
    TrackActivity,
    useActivity,
    useScopeActivity,
}
