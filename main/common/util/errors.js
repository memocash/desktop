// Error strings that cross the IPC boundary to be matched on rather than shown.
// Both processes read them from here so a renderer check can't drift from the
// value main actually sends.
const WalletErrors = {
    // The session's spend budget doesn't cover this one: ask for the password
    // and try again. Not a failure, and not something to show as an error.
    PasswordRequired: "password-required",
    SpendCancelled: "spend-cancelled",
    // A wallet already occupies the name. The renderer names the file in the
    // message it shows, which main has no business phrasing.
    WalletExists: "wallet-exists",
    WrongPassword: "wrong-password",
}

module.exports = {WalletErrors}
