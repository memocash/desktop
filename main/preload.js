const {ipcRenderer, clipboard, contextBridge} = require('electron')
const crypto = require("crypto")
const fs = require("fs/promises")
const homedir = require('os').homedir()

const getPathForWallet = wallet => {
    if (!wallet.startsWith("/")) {
        wallet = homedir + "/.memo/wallets/" + wallet + ".json"
    }
    return wallet
}

contextBridge.exposeInMainWorld('electron', {
    message: {
        send: (payload) => ipcRenderer.send('message', payload),
        on: (handler) => ipcRenderer.on('message', handler),
        off: (handler) => ipcRenderer.off('message', handler),
    },
    getPathForWallet,
    listenFile: (handler) => {
        ipcRenderer.on("listenFile", handler)
    },
    getWalletFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        return await fs.readFile(wallet, {encoding: "utf8"})
    },
    openDialog: () => {
        ipcRenderer.send("open-dialog")
    },
    createFile: async (walletName, seedPhrase, password) => {
        if (!walletName.startsWith("/")) {
            await fs.mkdir(homedir + "/.memo/wallets", {recursive: true})
        }
        const wallet = getPathForWallet(walletName)
        let obj = {
            time: new Date(),
            seed: seedPhrase,
        }
        if (password) {
            obj.password = password
            let contents = JSON.stringify(obj)
            let salt = crypto.randomBytes(128)
            let derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256")
            let iv = crypto.randomBytes(16)
            let cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv)
            let encrypted = cipher.update(Buffer.from(contents, "utf8"), "utf8", "base64")
            encrypted += cipher.final("base64")
            let authTag = cipher.getAuthTag()
            console.log("Encrypted: " + encrypted)
            //await fs.writeFile(wallet, encrypted)

            let decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv)
            decipher.setAuthTag(authTag)
            let decrypted = decipher.update(encrypted, "base64", "utf8")
            decrypted += decipher.final("utf8")
            decrypted = Buffer.from(decrypted, "utf8")
            console.log("decrypted: " + decrypted)
            // TODO: Save encrypted file and be able to read it
        }
        await fs.writeFile(wallet, JSON.stringify(obj))
    },
    checkFile: async (walletName) => {
        const wallet = getPathForWallet(walletName)
        try {
            await fs.access(wallet)
            return true
        } catch (err) {
            return false
        }
    },
    clearClipboard: () => clipboard.clear(),
})
