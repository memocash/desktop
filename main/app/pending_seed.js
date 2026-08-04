const {generateMnemonic, validateMnemonic} = require("bip39")

// A seed being created lives here, in main, from the moment it exists. The
// renderer used to generate the mnemonic itself and hand it back at the end,
// which left the one secret the whole app is built around sitting in page
// state for the length of the flow. Now main generates it, main checks the
// confirmation against it, and main writes it into the wallet file; the
// renderer is handed the words once, to put in front of the person writing
// them down, and nothing it sends back is ever the seed the wallet gets.
//
// One pending seed per window, because the flow is one window's business: a
// second wallet window creating its own seed must not see or disturb this
// one's. The entry lives until the wallet is created or the window closes,
// whichever comes first, and starting over just writes over it.

const pending = new Map()

const Generate = (winId) => {
    const words = generateMnemonic()
    pending.set(winId, {words, confirmed: false})
    return words
}

// The words as they will be compared and stored: what people type has its own
// ideas about spacing, and a seed must not fail its confirmation - or worse,
// be written to the file - over a double space.
const normalize = (phrase) => String(phrase || "").trim().split(/\s+/).join(" ")

// A seed the user already has, typed from their own record - which is the very
// thing the confirmation step exists to prove for a generated one, so an
// imported seed arrives confirmed.
const Import = (winId, phrase) => {
    const words = normalize(phrase)
    if (!validateMnemonic(words)) {
        return false
    }
    pending.set(winId, {words, confirmed: true})
    return true
}

// Whether the person has the words main is holding. Answered against main's
// copy rather than the renderer's, so the phrase that passes confirmation is
// by construction the phrase the wallet will store.
const Confirm = (winId, typed) => {
    const entry = pending.get(winId)
    if (!entry || entry.words !== normalize(typed)) {
        return false
    }
    entry.confirmed = true
    return true
}

// The seed for the wallet being created. Only a confirmed one: a wallet
// written before its owner proved they stored the words is a wallet one
// misplaced note away from being unrecoverable. Left in place until Discard,
// so a create that fails - the name taken in the meantime - can be tried
// again without walking the seed flow over.
const Use = (winId) => {
    const entry = pending.get(winId)
    if (!entry || !entry.confirmed) {
        throw new Error("no confirmed seed for this window")
    }
    return entry.words
}

const Discard = (winId) => pending.delete(winId)

module.exports = {
    Confirm,
    Discard,
    Generate,
    Import,
    Use,
}
