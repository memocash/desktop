// The base58check half of @bitcoin-dot-com/bitcoincashjs2-lib src/address.js
// (MIT) - the only half this wallet can reach, since BCH never adopted the
// segwit bech32 addresses the library's other branches served. Parity with
// the library on every reachable input is held by address.test.js against
// its outputs captured in golden.json before its removal (audit D4).
const bs58check = require("./base58check")
const OPS = require("./opcodes.json")
const bscript = require("./script")
const networks = require("./networks")

const fromBase58Check = (address) => {
    const payload = bs58check.decode(address)
    if (payload.length < 21) throw new TypeError(address + " is too short")
    if (payload.length > 21) throw new TypeError(address + " is too long")
    const version = payload.readUInt8(0)
    const hash = payload.slice(1)
    return {version: version, hash: hash}
}

const toBase58Check = (hash, version) => {
    if (!Buffer.isBuffer(hash) || hash.length !== 20) {
        throw new TypeError("Expected 160-bit hash Buffer")
    }
    if (!Number.isInteger(version) || version < 0 || version > 0xff) {
        throw new TypeError("Expected UInt8 version")
    }
    const payload = Buffer.allocUnsafe(21)
    payload.writeUInt8(version, 0)
    hash.copy(payload, 1)
    return bs58check.encode(payload)
}

// OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
const isP2pkhOutput = (script) =>
    script.length === 25 &&
    script[0] === OPS.OP_DUP &&
    script[1] === OPS.OP_HASH160 &&
    script[2] === 0x14 &&
    script[23] === OPS.OP_EQUALVERIFY &&
    script[24] === OPS.OP_CHECKSIG

// OP_HASH160 <20 bytes> OP_EQUAL
const isP2shOutput = (script) =>
    script.length === 23 &&
    script[0] === OPS.OP_HASH160 &&
    script[1] === 0x14 &&
    script[22] === OPS.OP_EQUAL

const fromOutputScript = (outputScript) => {
    if (isP2pkhOutput(outputScript)) {
        return toBase58Check(outputScript.slice(3, 23), networks.bitcoin.pubKeyHash)
    }
    if (isP2shOutput(outputScript)) {
        return toBase58Check(outputScript.slice(2, 22), networks.bitcoin.scriptHash)
    }
    throw new Error(bscript.toASM(outputScript) + " has no matching Address")
}

const toOutputScript = (address) => {
    let decode
    try {
        decode = fromBase58Check(address)
    } catch (e) {
    }
    if (decode) {
        if (decode.version === networks.bitcoin.pubKeyHash) {
            return bscript.compile([OPS.OP_DUP, OPS.OP_HASH160, decode.hash, OPS.OP_EQUALVERIFY, OPS.OP_CHECKSIG])
        }
        if (decode.version === networks.bitcoin.scriptHash) {
            return bscript.compile([OPS.OP_HASH160, decode.hash, OPS.OP_EQUAL])
        }
    }
    throw new Error(address + " has no matching Script")
}

module.exports = {
    fromBase58Check: fromBase58Check,
    fromOutputScript: fromOutputScript,
    toBase58Check: toBase58Check,
    toOutputScript: toOutputScript,
}
