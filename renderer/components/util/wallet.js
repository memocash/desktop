// Main fills in the settings a file has not got round to storing, so what comes
// back always has them. This used to write them into the wallet first, which
// meant opening a wallet wrote to it before anything had asked for a change.
const GetWallet = async () => window.electron.getWallet()

export default GetWallet
