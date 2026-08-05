// The three hashes bitcoin key and transaction handling need, over
// @noble/hashes - already in the tree as bip32's engine - rather than
// node:crypto, so the same code can serve the renderer bundle when the
// remaining library pieces move here (audit D4).
const {sha256: nobleSha256} = require("@noble/hashes/sha256")
const {ripemd160: nobleRipemd160} = require("@noble/hashes/ripemd160")

const sha256 = (buffer) => Buffer.from(nobleSha256(buffer))

const hash256 = (buffer) => Buffer.from(nobleSha256(nobleSha256(buffer)))

const hash160 = (buffer) => Buffer.from(nobleRipemd160(nobleSha256(buffer)))

module.exports = {
    hash160: hash160,
    hash256: hash256,
    sha256: sha256,
}
