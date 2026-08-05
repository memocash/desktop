// OP_PUSHDATA length encoding, ported from pushdata-bitcoin 1.2.1 (MIT,
// Daniel Cousens) when the vendored copy moved in-house. Byte-for-byte
// parity with the original is held transitively by script.test.js, which
// pins compile/decompile against golden.json.
const OPS = require("./opcodes.json")

const encodingLength = (i) => i < OPS.OP_PUSHDATA1 ? 1 : i <= 0xff ? 2 : i <= 0xffff ? 3 : 5

const encode = (buffer, number, offset) => {
    const size = encodingLength(number)
    if (size === 1) {
        buffer.writeUInt8(number, offset)
    } else if (size === 2) {
        buffer.writeUInt8(OPS.OP_PUSHDATA1, offset)
        buffer.writeUInt8(number, offset + 1)
    } else if (size === 3) {
        buffer.writeUInt8(OPS.OP_PUSHDATA2, offset)
        buffer.writeUInt16LE(number, offset + 1)
    } else {
        buffer.writeUInt8(OPS.OP_PUSHDATA4, offset)
        buffer.writeUInt32LE(number, offset + 1)
    }
    return size
}

const decode = (buffer, offset) => {
    const opcode = buffer.readUInt8(offset)
    if (opcode < OPS.OP_PUSHDATA1) {
        return {opcode: opcode, number: opcode, size: 1}
    }
    if (opcode === OPS.OP_PUSHDATA1) {
        if (offset + 2 > buffer.length) return null
        return {opcode: opcode, number: buffer.readUInt8(offset + 1), size: 2}
    }
    if (opcode === OPS.OP_PUSHDATA2) {
        if (offset + 3 > buffer.length) return null
        return {opcode: opcode, number: buffer.readUInt16LE(offset + 1), size: 3}
    }
    if (offset + 5 > buffer.length) return null
    if (opcode !== OPS.OP_PUSHDATA4) throw new Error("Unexpected opcode")
    return {opcode: opcode, number: buffer.readUInt32LE(offset + 1), size: 5}
}

module.exports = {
    encodingLength: encodingLength,
    encode: encode,
    decode: decode,
}
