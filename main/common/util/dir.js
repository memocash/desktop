const path = require("path")
const homedir = require("os").homedir()

const Dir = {
    DefaultPath: homedir + path.sep + ".memo" + path.sep + "wallets",
    IsFullPath: (path) => {
        return path.startsWith("/") || /^[A-Z]\:\\/.test(path)
    },
}

module.exports = {
    Dir: Dir,
}
