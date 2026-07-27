const path = require("path")
const homedir = require("os").homedir()

const Dir = {
    DefaultPath: homedir + path.sep + ".memo" + path.sep + "wallets",
    NetworkConfigFile: homedir + path.sep + ".memo" + path.sep + "network.json",
    ThemeConfigFile: homedir + path.sep + ".memo" + path.sep + "theme.json",
    UpdateConfigFile: homedir + path.sep + ".memo" + path.sep + "updates.json",
    IsFullPath: (path) => {
        return path.startsWith("/") || /^[A-Z]\:\\/.test(path)
    },
}

module.exports = {
    Dir: Dir,
}
