// The settings form's send-confirmation decisions, in commonjs so node's test
// runner can require them directly - settings.js is jsx that only the bundler
// loads. The pattern router_core and selector_core set.

// Which choice a wallet's stored settings amount to: the threshold field
// carries a running total, and turning confirmation off is its own switch.
// A wallet whose file predates either reads as asking every time.
const ConfirmModeOf = (settings) => {
    if (settings.ConfirmSends === false) {
        return "never"
    }
    return (settings.PasswordThreshold || 0) > 0 ? "limit" : "every"
}

// Whether the threshold field means anything under this choice. Outside it the
// field stays on the page, hidden, so the modal doesn't resize as the choice
// changes - and disabled, because a hidden field still takes part in the
// browser's own form validation: its min of 1 against the 0 every other choice
// loads with would refuse the submit before the form's handler ever ran.
const ThresholdInUse = (mode) => mode === "limit"

// What is wrong with the typed threshold, or undefined. Only asked of the
// running total; under any other choice whatever the field holds is ignored.
const ThresholdError = (mode, threshold) => {
    if (!ThresholdInUse(mode)) {
        return undefined
    }
    const wanted = Number(threshold)
    if (!String(threshold).trim().length || !Number.isSafeInteger(wanted) || wanted < 1) {
        return "Enter a whole number of satoshis above zero."
    }
    return undefined
}

// The stored form of a choice. A threshold left in the field from an earlier
// choice is never written.
const ConfirmValues = (mode, threshold) => ({
    PasswordThreshold: ThresholdInUse(mode) ? Number(threshold) : 0,
    ConfirmSends: mode !== "never",
})

module.exports = {
    ConfirmModeOf,
    ConfirmValues,
    ThresholdError,
    ThresholdInUse,
}
