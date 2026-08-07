// WIF structure checks without any curve math, so the renderer can validate
// pasted keys in the bundle without shipping an EC library: base58check, the
// mainnet version byte, one of the two valid lengths, and a scalar in [1, n).
// Deriving the address a key controls stays in main (ecpair.js), which is the
// only side that should ever hold key material anyway.
const bs58check = require("./base58check")

const WifVersion = 0x80

// The secp256k1 group order; a private key is a scalar in [1, n).
const CurveOrder = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141")

const DecodeWif = (string) => {
    const payload = bs58check.decode(string)
    if (payload[0] !== WifVersion) {
        throw new Error("Invalid network version")
    }
    let privateKey
    let compressed
    if (payload.length === 34) {
        if (payload[33] !== 0x01) {
            throw new Error("Invalid compression flag")
        }
        privateKey = payload.slice(1, 33)
        compressed = true
    } else if (payload.length === 33) {
        privateKey = payload.slice(1)
        compressed = false
    } else {
        throw new Error("Invalid WIF length")
    }
    const scalar = BigInt("0x" + privateKey.toString("hex"))
    if (scalar === 0n || scalar >= CurveOrder) {
        throw new Error("Private key not in range [1, n)")
    }
    return {privateKey: privateKey, compressed: compressed}
}

const IsValidWif = (string) => {
    if (typeof string !== "string" || !string.length) {
        return false
    }
    try {
        DecodeWif(string)
        return true
    } catch (e) {
        return false
    }
}

module.exports = {
    DecodeWif: DecodeWif,
    IsValidWif: IsValidWif,
    WifVersion: WifVersion,
}
