// The compile/decompile/toASM trio ported from
// @bitcoin-dot-com/bitcoincashjs2-lib src/script.js (MIT), over the same
// vendored pushdata-bitcoin and bitcoincash-ops it used. Byte-for-byte parity
// with the library is the contract: script.test.js holds the two
// implementations against each other for as long as the library stays
// installed (audit D4).
const pushdata = require("pushdata-bitcoin")
const OPS = require("bitcoincash-ops")
const REVERSE_OPS = require("bitcoincash-ops/map")

const OP_INT_BASE = OPS.OP_RESERVED // OP_1 - 1

// BIP62.3 minimal push: data that is really a small integer is written as the
// integer opcode rather than a one-byte pushdata.
const asMinimalOP = (buffer) => {
    if (buffer.length === 0) return OPS.OP_0
    if (buffer.length !== 1) return undefined
    if (buffer[0] >= 1 && buffer[0] <= 16) return OP_INT_BASE + buffer[0]
    if (buffer[0] === 0x81) return OPS.OP_1NEGATE
    return undefined
}

const compile = (chunks) => {
    if (Buffer.isBuffer(chunks)) return chunks
    if (!Array.isArray(chunks)) throw new TypeError("Expected Array, got " + chunks)
    const bufferSize = chunks.reduce((accum, chunk) => {
        if (Buffer.isBuffer(chunk)) {
            if (chunk.length === 1 && asMinimalOP(chunk) !== undefined) {
                return accum + 1
            }
            return accum + pushdata.encodingLength(chunk.length) + chunk.length
        }
        return accum + 1
    }, 0)
    const buffer = Buffer.allocUnsafe(bufferSize)
    let offset = 0
    for (const chunk of chunks) {
        if (Buffer.isBuffer(chunk)) {
            const opcode = asMinimalOP(chunk)
            if (opcode !== undefined) {
                buffer.writeUInt8(opcode, offset)
                offset += 1
                continue
            }
            offset += pushdata.encode(buffer, chunk.length, offset)
            chunk.copy(buffer, offset)
            offset += chunk.length
        } else {
            buffer.writeUInt8(chunk, offset)
            offset += 1
        }
    }
    if (offset !== buffer.length) throw new Error("Could not decode chunks")
    return buffer
}

const decompile = (buffer) => {
    const chunks = []
    let i = 0
    while (i < buffer.length) {
        const opcode = buffer[i]
        if (opcode > OPS.OP_0 && opcode <= OPS.OP_PUSHDATA4) {
            const d = pushdata.decode(buffer, i)
            // An unreadable pushdata length means the rest was never a
            // script; the library returns [] here rather than throwing, and
            // callers rely on that.
            if (d === null) return []
            i += d.size
            const data = buffer.slice(i, i + d.number)
            i += d.number
            const op = asMinimalOP(data)
            if (op !== undefined) {
                chunks.push(op)
            } else {
                chunks.push(data)
            }
        } else {
            chunks.push(opcode)
            i += 1
        }
    }
    return chunks
}

const toASM = (chunks) => {
    if (Buffer.isBuffer(chunks)) {
        chunks = decompile(chunks)
    }
    return chunks.map((chunk) => {
        if (Buffer.isBuffer(chunk)) {
            const op = asMinimalOP(chunk)
            if (op === undefined) return chunk.toString("hex")
            chunk = op
        }
        return REVERSE_OPS[chunk]
    }).join(" ")
}

module.exports = {
    compile: compile,
    decompile: decompile,
    toASM: toASM,
}
