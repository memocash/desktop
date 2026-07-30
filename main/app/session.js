const crypto = require("crypto")

// A wallet password that outlives one operation, split so that neither process
// holds anything usable on its own: main keeps the ciphertext, the renderer
// keeps the key, and a spend needs both. Main's memory alone - a crash dump, a
// core file, whatever is left in swap - yields no password, and dropping the
// ciphertext ends the session for good, whatever the other side still has.
//
// What this is not: protection against a compromised renderer. That renderer
// holds the key and can ask main to spend with it. What bounds that is the
// budget the caller enforces around this, and the confirmation main asks for
// before anything leaves the wallet.

const KeyBytes = 32
const IvBytes = 12
const Cipher = "aes-256-gcm"

const Seal = (secret) => {
    const key = crypto.randomBytes(KeyBytes)
    const iv = crypto.randomBytes(IvBytes)
    const cipher = crypto.createCipheriv(Cipher, key, iv)
    const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
    return {
        key: key.toString("base64"),
        envelope: {
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
            data: data.toString("base64"),
        },
    }
}

// Returns undefined rather than throwing for a key that doesn't open the
// envelope: a caller that can't produce the key is in the same position as one
// that never had a session, and both are asked for the password instead.
const Open = (envelope, key) => {
    if (!envelope || typeof key !== "string") {
        return undefined
    }
    try {
        const keyBytes = Buffer.from(key, "base64")
        if (keyBytes.length !== KeyBytes) {
            return undefined
        }
        const decipher = crypto.createDecipheriv(
            Cipher, keyBytes, Buffer.from(envelope.iv, "base64"))
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
        return Buffer.concat([
            decipher.update(Buffer.from(envelope.data, "base64")),
            decipher.final(),
        ]).toString("utf8")
    } catch (e) {
        return undefined
    }
}

module.exports = {
    KeyBytes,
    Open,
    Seal,
}
