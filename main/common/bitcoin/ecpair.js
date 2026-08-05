// Key handling over tiny-secp256k1, replacing the library ECPair the signer
// and derivation used (audit D4). Only what the app does is here: WIF codec
// both ways, pubkey-only pairs for derived addresses, P2PKH addresses, and
// deterministic ECDSA signing. tiny-secp256k1 and the library both sign plain
// RFC6979 with low-S, so signatures are byte-identical - ecpair.test.js holds
// that parity while the library stays installed.
const ecc = require("tiny-secp256k1")
const bs58check = require("bs58check")
const {hash160} = require("./hash")
const {toBase58Check} = require("./address")
const networks = require("./networks")

const WifVersion = 0x80

class ECPair {
    constructor(privateKey, publicKey, compressed) {
        this.privateKey = privateKey
        this.publicKeyBuffer = publicKey
        this.compressed = compressed
    }

    static fromWIF(string) {
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
        if (!ecc.isPrivate(privateKey)) {
            throw new Error("Private key not in range [1, n)")
        }
        return new ECPair(privateKey, null, compressed)
    }

    static fromPublicKeyBuffer(buffer) {
        if (!ecc.isPoint(buffer)) {
            throw new Error("Invalid public key")
        }
        return new ECPair(null, Buffer.from(buffer), buffer.length === 33)
    }

    getPublicKeyBuffer() {
        if (!this.publicKeyBuffer) {
            this.publicKeyBuffer = Buffer.from(ecc.pointFromScalar(this.privateKey, this.compressed))
        }
        return this.publicKeyBuffer
    }

    getAddress() {
        return toBase58Check(hash160(this.getPublicKeyBuffer()), networks.bitcoin.pubKeyHash)
    }

    toWIF() {
        if (!this.privateKey) {
            throw new Error("Missing private key")
        }
        const payload = Buffer.concat(this.compressed
            ? [Buffer.from([WifVersion]), this.privateKey, Buffer.from([0x01])]
            : [Buffer.from([WifVersion]), this.privateKey])
        return bs58check.encode(payload)
    }

    // 64-byte compact (r, s), deterministic per RFC6979, low-S.
    sign(hash) {
        if (!this.privateKey) {
            throw new Error("Missing private key")
        }
        return Buffer.from(ecc.sign(hash, this.privateKey))
    }
}

// A canonical DER integer: leading zero bytes stripped, one restored when the
// top bit would otherwise read as a sign.
const derInteger = (buffer) => {
    let start = 0
    while (start < buffer.length - 1 && buffer[start] === 0x00 && !(buffer[start + 1] & 0x80)) {
        start++
    }
    let trimmed = buffer.slice(start)
    if (trimmed[0] & 0x80) {
        trimmed = Buffer.concat([Buffer.from([0x00]), trimmed])
    }
    return trimmed
}

// What goes into a scriptSig: the DER-encoded signature with the sighash type
// appended as its final byte.
const ScriptSignature = (compactSignature, hashType) => {
    const r = derInteger(compactSignature.slice(0, 32))
    const s = derInteger(compactSignature.slice(32, 64))
    const body = Buffer.concat([
        Buffer.from([0x02, r.length]), r,
        Buffer.from([0x02, s.length]), s,
    ])
    return Buffer.concat([Buffer.from([0x30, body.length]), body, Buffer.from([hashType])])
}

module.exports = {
    ECPair: ECPair,
    ScriptSignature: ScriptSignature,
}
