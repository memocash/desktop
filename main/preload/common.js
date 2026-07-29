const path = require("path");
const {Dir} = require("../common/util");

module.exports = {
    // Shortens a chosen wallet path for display in the load form. Pure string
    // work - wallet file access and decryption live in main/app/keystore.js.
    getWalletShort: wallet => {
        if (Dir.IsFullPath(Dir.DefaultPath + path.sep)) {
            return wallet.slice((Dir.DefaultPath + path.sep).length)
        }
        return wallet
    },
}
