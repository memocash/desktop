// Base58Check in place of the bs58check package: the last piece of the
// bitcoin codec that still came from outside (audit D4 follow-up). The spec
// has been frozen since Satoshi - an alphabet, big-integer base conversion
// with '1' for each leading zero byte, and a double-SHA256 checksum, which
// hash.js already provides. Parity with bs58check on every WIF and address
// the app can produce is held by the golden.json fixtures through the wif,
// address, and ecpair tests, and by base58check.test.js directly.
const {hash256} = require("./hash")

const Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const Values = new Map([...Alphabet].map((char, i) => [char, BigInt(i)]))

const encode = (payload) => {
    const bytes = Buffer.concat([payload, hash256(payload).subarray(0, 4)])
    let num = BigInt("0x" + bytes.toString("hex"))
    let encoded = ""
    while (num > 0n) {
        encoded = Alphabet[Number(num % 58n)] + encoded
        num /= 58n
    }
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
        encoded = "1" + encoded
    }
    return encoded
}

const decode = (string) => {
    if (typeof string !== "string") {
        throw new TypeError("Expected base58 string")
    }
    let num = 0n
    for (const char of string) {
        const value = Values.get(char)
        if (value === undefined) {
            throw new Error("Non-base58 character")
        }
        num = num * 58n + value
    }
    let leading = 0
    while (leading < string.length && string[leading] === "1") {
        leading++
    }
    // A zero value contributes no bytes: its digits are exactly the leading
    // '1's already counted, and toString would mint a spurious 0x00.
    let hex = num === 0n ? "" : num.toString(16)
    if (hex.length % 2) {
        hex = "0" + hex
    }
    const bytes = Buffer.concat([Buffer.alloc(leading), Buffer.from(hex, "hex")])
    if (bytes.length < 4) {
        throw new Error("Invalid checksum")
    }
    const payload = bytes.subarray(0, bytes.length - 4)
    if (!hash256(payload).subarray(0, 4).equals(bytes.subarray(bytes.length - 4))) {
        throw new Error("Invalid checksum")
    }
    return Buffer.from(payload)
}

module.exports = {
    decode: decode,
    encode: encode,
}
