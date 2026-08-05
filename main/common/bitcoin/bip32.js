// BIP32 hierarchical deterministic keys over tiny-secp256k1 and the internal
// hash and base58check modules, replacing the bip32 package and the last
// external cluster in the key path (wif, bs58check, valibot, @scure/base).
// Only what this wallet does is here: a master key from a seed, xpub parsing,
// hardened and normal child derivation on both the private and public side,
// neutering, and the two serializations. The spec has been final since 2012;
// parity with the package is held by bip32_golden.json, captured from it
// before removal and cross-checked against the BIP32 test vectors.
const {hmac} = require("@noble/hashes/hmac")
const {sha512} = require("@noble/hashes/sha512")
const ecc = require("tiny-secp256k1")
const bs58check = require("./base58check")
const {hash160} = require("./hash")
const {ECPair} = require("./ecpair")

const Hardened = 0x80000000
const PrivateVersion = 0x0488ade4
const PublicVersion = 0x0488b21e
const PathShape = /^(m\/)?(\d+'?\/)*\d+'?$/

const hmacSHA512 = (key, data) => Buffer.from(hmac(sha512, key, data))

class BIP32 {
    constructor(privateKey, publicKey, chainCode, depth, index, parentFingerprint) {
        this.privateKey = privateKey
        this._publicKey = publicKey
        this.chainCode = chainCode
        this.depth = depth
        this.index = index
        this.parentFingerprint = parentFingerprint
    }

    get publicKey() {
        if (!this._publicKey) {
            this._publicKey = Buffer.from(ecc.pointFromScalar(this.privateKey, true))
        }
        return this._publicKey
    }

    get fingerprint() {
        return hash160(this.publicKey).readUInt32BE(0)
    }

    isNeutered() {
        return this.privateKey === null
    }

    neutered() {
        return new BIP32(null, this.publicKey, this.chainCode, this.depth, this.index, this.parentFingerprint)
    }

    derive(index) {
        if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
            throw new TypeError("Expected UInt32 index")
        }
        const data = Buffer.allocUnsafe(37)
        if (index >= Hardened) {
            if (this.isNeutered()) {
                throw new TypeError("Missing private key for hardened child key")
            }
            data[0] = 0x00
            this.privateKey.copy(data, 1)
        } else {
            this.publicKey.copy(data, 0)
        }
        data.writeUInt32BE(index, 33)
        const digest = hmacSHA512(this.chainCode, data)
        const tweak = digest.subarray(0, 32)
        const chainCode = digest.subarray(32)
        // The spec's out-of-range escape hatch: an unusable tweak or a zero
        // result means this index has no key, and the next index serves it.
        if (!ecc.isPrivate(tweak)) {
            return this.derive(index + 1)
        }
        if (!this.isNeutered()) {
            const childKey = ecc.privateAdd(this.privateKey, tweak)
            if (childKey === null) {
                return this.derive(index + 1)
            }
            return new BIP32(Buffer.from(childKey), null, chainCode, this.depth + 1, index, this.fingerprint)
        }
        const childPoint = ecc.pointAddScalar(this.publicKey, tweak, true)
        if (childPoint === null) {
            return this.derive(index + 1)
        }
        return new BIP32(null, Buffer.from(childPoint), chainCode, this.depth + 1, index, this.fingerprint)
    }

    derivePath(path) {
        if (typeof path !== "string" || !PathShape.test(path)) {
            throw new TypeError("Expected BIP32Path, got " + String(path))
        }
        let segments = path.split("/")
        if (segments[0] === "m") {
            if (this.parentFingerprint) {
                throw new TypeError("Expected master, got child")
            }
            segments = segments.slice(1)
        }
        return segments.reduce((node, segment) => segment.endsWith("'")
            ? node.derive(parseInt(segment, 10) + Hardened)
            : node.derive(parseInt(segment, 10)), this)
    }

    toBase58() {
        const buffer = Buffer.allocUnsafe(78)
        buffer.writeUInt32BE(this.isNeutered() ? PublicVersion : PrivateVersion, 0)
        buffer.writeUInt8(this.depth, 4)
        buffer.writeUInt32BE(this.parentFingerprint, 5)
        buffer.writeUInt32BE(this.index, 9)
        this.chainCode.copy(buffer, 13)
        if (this.isNeutered()) {
            this.publicKey.copy(buffer, 45)
        } else {
            buffer.writeUInt8(0, 45)
            this.privateKey.copy(buffer, 46)
        }
        return bs58check.encode(buffer)
    }

    toWIF() {
        if (this.isNeutered()) {
            throw new TypeError("Missing private key")
        }
        return ECPair.fromPrivateKey(this.privateKey).toWIF()
    }
}

const fromSeed = (seed) => {
    if (!Buffer.isBuffer(seed) || seed.length < 16 || seed.length > 64) {
        throw new TypeError("Seed should be between 128 and 512 bits")
    }
    const digest = hmacSHA512(Buffer.from("Bitcoin seed", "utf8"), seed)
    const key = digest.subarray(0, 32)
    if (!ecc.isPrivate(key)) {
        throw new Error("Private key not in range [1, n)")
    }
    return new BIP32(Buffer.from(key), null, digest.subarray(32), 0, 0, 0)
}

const fromBase58 = (string) => {
    const buffer = bs58check.decode(string)
    if (buffer.length !== 78) {
        throw new TypeError("Invalid buffer length")
    }
    const version = buffer.readUInt32BE(0)
    if (version !== PrivateVersion && version !== PublicVersion) {
        throw new TypeError("Invalid network version")
    }
    const depth = buffer.readUInt8(4)
    const parentFingerprint = buffer.readUInt32BE(5)
    const index = buffer.readUInt32BE(9)
    if (depth === 0 && (parentFingerprint !== 0 || index !== 0)) {
        throw new TypeError("Invalid master key serialization")
    }
    const chainCode = Buffer.from(buffer.subarray(13, 45))
    if (version === PrivateVersion) {
        if (buffer.readUInt8(45) !== 0x00) {
            throw new TypeError("Invalid private key serialization")
        }
        const key = Buffer.from(buffer.subarray(46))
        if (!ecc.isPrivate(key)) {
            throw new Error("Private key not in range [1, n)")
        }
        return new BIP32(key, null, chainCode, depth, index, parentFingerprint)
    }
    const key = Buffer.from(buffer.subarray(45))
    if (!ecc.isPoint(key)) {
        throw new TypeError("Point is not on the curve")
    }
    return new BIP32(null, key, chainCode, depth, index, parentFingerprint)
}

module.exports = {
    fromBase58: fromBase58,
    fromSeed: fromSeed,
}
