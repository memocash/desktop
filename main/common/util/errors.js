// Error strings that cross the IPC boundary to be matched on rather than shown.
// Both processes read them from here so a renderer check can't drift from the
// value main actually sends.
const WalletErrors = {
    // The session's spend budget doesn't cover this one: ask for the password
    // and try again. Not a failure, and not something to show as an error.
    PasswordRequired: "password-required",
    SpendCancelled: "spend-cancelled",
    WrongPassword: "wrong-password",
}

module.exports = {WalletErrors}
