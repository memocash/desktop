const fs = require("fs/promises")
const path = require("path");
const CryptoJS = require("crypto-js");
const {Dir} = require("../common/util");

module.exports = {
    decryptWallet: (encryptedWallet, inputPassword) => {
        const bytes = CryptoJS.AES.decrypt(encryptedWallet, inputPassword)
        return bytes.toString(CryptoJS.enc.Utf8)
    },
    fileExists: async (path) => {
        return new Promise((resolve, reject) => {
            fs.stat(path, (err) => {
                if (err === null) {
                    resolve(true)
                } else {
                    resolve(false)
                }
            })
        })
    },
    getPathForWallet: wallet => {
        wallet = wallet.trim()
        if (!Dir.IsFullPath(wallet)) {
            wallet = Dir.DefaultPath + path.sep + wallet
        }
        return wallet
    },
    getWalletShort: wallet => {
        if (Dir.IsFullPath(Dir.DefaultPath + path.sep)) {
            return wallet.slice((Dir.DefaultPath + path.sep).length)
        }
        return wallet
    },
}
