// The two hashes bitcoin key and transaction handling need, over
// @noble/hashes - already in the tree as bip32's engine - rather than
// node:crypto, so the same code can serve the renderer bundle when the
// remaining library pieces move here (audit D4).
const {sha256: nobleSha256} = require("@noble/hashes/sha2.js")
const {ripemd160: nobleRipemd160} = require("@noble/hashes/legacy.js")

const hash256 = (buffer) => Buffer.from(nobleSha256(nobleSha256(buffer)))

const hash160 = (buffer) => Buffer.from(nobleRipemd160(nobleSha256(buffer)))

module.exports = {
    hash160: hash160,
    hash256: hash256,
}
