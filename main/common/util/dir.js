const path = require("path")
const homedir = require("os").homedir()

const Dir = {
    DefaultPath: homedir + path.sep + ".memo" + path.sep + "wallets",
    NetworkConfigFile: homedir + path.sep + ".memo" + path.sep + "network.json",
    // Main's record of the servers a person approved, beside the
    // configuration rather than in it: network.json keeps the shape every
    // version of the app validates, so a release that knows nothing of
    // approvals still reads the person's networks.
    NetworkApprovedFile: homedir + path.sep + ".memo" + path.sep + "network-approved.json",
    ThemeConfigFile: homedir + path.sep + ".memo" + path.sep + "theme.json",
    UpdateConfigFile: homedir + path.sep + ".memo" + path.sep + "updates.json",
    IsFullPath: (path) => {
        return path.startsWith("/") || /^[A-Z]\:\\/i.test(path)
    },
}

module.exports = {
    Dir: Dir,
}
