const crypto = require("crypto")
const {promisify} = require("util")
const CryptoJS = require("crypto-js")
const {WalletErrors} = require("../common/util")

const scrypt = promisify(crypto.scrypt)

// The on-disk wallet format. Version 2 keeps public metadata beside an encrypted
// envelope rather than encrypting the wallet whole, because addresses, the
// change and SLP lists, and settings are written constantly - and a format that
// needs the password for those writes is a format that has to keep the password
// around. The seed, imported keys, and the key authenticating the public half
// go inside the envelope.
//
// Version 1 is what earlier releases wrote: either bare JSON when the wallet had
// no password, or a CryptoJS passphrase blob when it did. It is still read, so
// existing wallets open, but it is never written - see MigrateContents.

const Version = 2
// Shared with the renderer so its checks match what main sends.
const WrongPassword = WalletErrors.WrongPassword

// scrypt at N=32768 with r=8 needs 128*N*r bytes, which is exactly Node's
// default maxmem, so the derivation throws unless the limit is raised.
const ScryptMaxmem = 64 * 1024 * 1024
const DefaultKdf = {name: "scrypt", N: 32768, r: 8, p: 1, keyLength: 32}
const SaltBytes = 16
const CipherName = "aes-256-gcm"
const IvBytes = 12

const NoEncryption = "none"
const ScryptGcm = "scrypt-aes-256-gcm"
// The MAC over the public half proves it was last written by someone holding
// the key sealed in the envelope. For a wallet with no password the envelope
// is cleartext and the key sits in it for anyone to read, so there the MAC
// catches accidents, not tampering - which is inherent to having no password,
// and no more than the format claims for such a file.
const PublicMacName = "hmac-sha256"
const PublicMacKeyField = "__publicMacKey"
const PublicMacKeyBytes = 32

// The wallet fields that may not sit outside the envelope. The public-MAC key
// is an internal field added separately and never returned as wallet data.
//
// The derivation metadata is in here for what it grants rather than for what it
// is: the account xpubs are not spending keys, but they derive every address the
// wallet will ever use, so leaving them in the cleartext half would let anyone
// holding the file follow the wallet forward forever without the password. The
// address lists stay outside because they are written constantly and the format
// exists so those writes need no password; the xpubs are written once, at
// creation and at migration, both of which have the password in hand.
const SecretFields = ["seed", "keys", "derivation"]

const splitWallet = (wallet) => {
    const secret = {}
    const publicData = {}
    for (const [field, value] of Object.entries(wallet)) {
        if (SecretFields.includes(field)) {
            secret[field] = value
        } else {
            publicData[field] = value
        }
    }
    return {secret, publicData}
}

const deriveKey = async (password, kdf) => {
    if (!kdf || kdf.name !== DefaultKdf.name) {
        throw new Error("unsupported key derivation: " + (kdf && kdf.name))
    }
    for (const field of ["N", "r", "p", "keyLength"]) {
        if (kdf[field] !== DefaultKdf[field]) {
            throw new Error("unsupported key derivation parameter: " + field)
        }
    }
    if (typeof kdf.salt !== "string" ||
        Buffer.from(kdf.salt, "base64").length !== SaltBytes) {
        throw new Error("unsupported key derivation salt")
    }
    return scrypt(password, Buffer.from(kdf.salt, "base64"), kdf.keyLength, {
        N: kdf.N,
        r: kdf.r,
        p: kdf.p,
        maxmem: ScryptMaxmem,
    })
}

const publicMac = (publicData, integrityKey) =>
    crypto.createHmac("sha256", integrityKey).update(JSON.stringify(publicData)).digest("base64")

const verifyPublic = (doc, integrityKey) => {
    if (!doc.publicMac || doc.publicMac.name !== PublicMacName ||
        typeof doc.publicMac.value !== "string") {
        throw new Error(WrongPassword)
    }
    const expected = Buffer.from(publicMac(doc.public, integrityKey), "base64")
    const actual = Buffer.from(doc.publicMac.value, "base64")
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw new Error(WrongPassword)
    }
}

const encryptSecret = async (secret, password) => {
    const kdf = {...DefaultKdf, salt: crypto.randomBytes(SaltBytes).toString("base64")}
    const key = await deriveKey(password, kdf)
    try {
        const iv = crypto.randomBytes(IvBytes)
        const cipher = crypto.createCipheriv(CipherName, key, iv)
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(secret), "utf8"),
            cipher.final(),
        ])
        return {
            encryption: ScryptGcm,
            kdf,
            cipher: {name: CipherName, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64")},
            ciphertext: ciphertext.toString("base64"),
        }
    } finally {
        // Buffers can at least be overwritten, unlike the strings either side.
        key.fill(0)
    }
}

// GCM authenticates, so a wrong password fails here rather than returning
// plausible-looking bytes. Corruption and truncation fail the same way, which is
// the point: nothing downstream has to guess whether the plaintext is real.
const decryptSecret = async (keystore, password) => {
    if (!keystore) {
        throw new Error("wallet file has no keystore")
    }
    if (keystore.encryption === NoEncryption) {
        return keystore.secret || {}
    }
    if (keystore.encryption !== ScryptGcm) {
        throw new Error("unsupported wallet encryption: " + keystore.encryption)
    }
    if (!password || !password.length) {
        throw new Error(WrongPassword)
    }
    if (!keystore.cipher || keystore.cipher.name !== CipherName) {
        throw new Error("unsupported wallet cipher: " + (keystore.cipher && keystore.cipher.name))
    }
    const key = await deriveKey(password, keystore.kdf)
    try {
        const decipher = crypto.createDecipheriv(
            CipherName, key, Buffer.from(keystore.cipher.iv, "base64"))
        decipher.setAuthTag(Buffer.from(keystore.cipher.tag, "base64"))
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(keystore.ciphertext, "base64")),
            decipher.final(),
        ])
        return JSON.parse(plaintext.toString("utf8"))
    } catch (e) {
        throw new Error(WrongPassword)
    } finally {
        key.fill(0)
    }
}

const decryptV1 = (contents, password) => {
    if (!password || !password.length) {
        throw new Error(WrongPassword)
    }
    let text
    try {
        text = CryptoJS.AES.decrypt(contents, password).toString(CryptoJS.enc.Utf8)
    } catch (e) {
        // The old format is unauthenticated, so a wrong password usually
        // surfaces as a UTF-8 decode failure rather than as anything explicit.
        throw new Error(WrongPassword)
    }
    if (!text.startsWith("{")) {
        throw new Error(WrongPassword)
    }
    return JSON.parse(text)
}

// Works out what a file is without needing the password. A v2 file is JSON with
// a version; a v1 file is bare JSON or a CryptoJS blob, and has neither.
const ReadForm = (contents) => {
    const text = contents.trimStart()
    if (!text.startsWith("{")) {
        return {version: 1, encrypted: true}
    }
    let doc
    try {
        doc = JSON.parse(text)
    } catch (e) {
        throw new Error("wallet file is not readable")
    }
    if (doc.version === undefined) {
        return {version: 1, encrypted: false, wallet: doc}
    }
    if (doc.version !== Version) {
        throw new Error("unsupported wallet version: " + doc.version)
    }
    if (!doc.keystore) {
        throw new Error("wallet file has no keystore")
    }
    return {version: Version, encrypted: doc.keystore.encryption !== NoEncryption, doc}
}

const IsEncrypted = (contents) => ReadForm(contents).encrypted

// Returns the wallet in the flat shape the rest of the app uses, whichever
// version the file is written in.
const DecodeContents = async (contents, password) => {
    const form = ReadForm(contents)
    if (form.version === 1) {
        return {
            version: 1,
            encrypted: form.encrypted,
            wallet: form.encrypted ? decryptV1(contents, password) : form.wallet,
        }
    }
    const storedSecret = await decryptSecret(form.doc.keystore, password)
    const encodedKey = storedSecret[PublicMacKeyField]
    if (typeof encodedKey !== "string" ||
        Buffer.from(encodedKey, "base64").length !== PublicMacKeyBytes) {
        throw new Error(WrongPassword)
    }
    const integrityKey = Buffer.from(encodedKey, "base64")
    verifyPublic(form.doc, integrityKey)
    const secret = {...storedSecret}
    delete secret[PublicMacKeyField]
    return {
        version: Version,
        encrypted: form.encrypted,
        wallet: {...form.doc.public, ...secret},
        integrityKey,
        // A field that belongs in the envelope but was found outside it. Reading
        // still works - the two halves are merged either way - but the file is
        // exposing something it should not be, and the caller can reseal it.
        publicSecrets: SecretFields.some((field) => form.doc.public[field] !== undefined),
    }
}

const EncodeWallet = async (wallet, password, currentIntegrityKey) => {
    const {secret, publicData} = splitWallet(wallet)
    const integrityKey = currentIntegrityKey || crypto.randomBytes(PublicMacKeyBytes)
    const storedSecret = {
        ...secret,
        [PublicMacKeyField]: integrityKey.toString("base64"),
    }
    const keystore = password && password.length
        ? await encryptSecret(storedSecret, password)
        : {encryption: NoEncryption, secret: storedSecret}
    const publicMacDoc = {name: PublicMacName, value: publicMac(publicData, integrityKey)}
    return {
        contents: JSON.stringify({version: Version, public: publicData, publicMac: publicMacDoc, keystore}),
        integrityKey,
    }
}

// Rewrites the public half without touching the envelope, so the routine writes
// - a new address, a changed setting - need no password and never decrypt.
const EncodePublic = (doc, publicData, integrityKey) => {
    verifyPublic(doc, integrityKey)
    const publicMacDoc = {name: PublicMacName, value: publicMac(publicData, integrityKey)}
    return JSON.stringify({version: Version, public: publicData, publicMac: publicMacDoc, keystore: doc.keystore})
}

module.exports = {
    DecodeContents,
    EncodePublic,
    EncodeWallet,
    IsEncrypted,
    ReadForm,
    SecretFields,
    Version,
    WrongPassword,
}
