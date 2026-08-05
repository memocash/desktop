// Transaction structure, wire codec, and the BCH signature hash, ported from
// @bitcoin-dot-com/bitcoincashjs2-lib's src/transaction.js (MIT) minus
// everything BCH cannot carry: no segwit serialization, no witness fields,
// and no pre-fork legacy sighash - every BCH signature since 2017 is BIP143
// with the forkid bit. Byte parity with the library on every reachable input
// is held by transaction.test.js against its outputs captured in golden.json
// before its removal (audit D4).
const {hash256} = require("./hash")

const DEFAULT_SEQUENCE = 0xffffffff
const SIGHASH_ALL = 0x01
const SIGHASH_NONE = 0x02
const SIGHASH_SINGLE = 0x03
const SIGHASH_ANYONECANPAY = 0x80
// BIP143 sighash activated in BCH via the 0x40 bit ("forkid").
const SIGHASH_BITCOINCASHBIP143 = 0x40

const MaxSatoshi = 21e14

const writeUInt64LE = (buffer, value, offset) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > MaxSatoshi) {
        throw new TypeError("Expected Satoshi value")
    }
    buffer.writeInt32LE(value & -1, offset)
    buffer.writeUInt32LE(Math.floor(value / 0x100000000), offset + 4)
    return offset + 8
}

const readUInt64LE = (buffer, offset) => {
    const a = buffer.readUInt32LE(offset)
    const b = buffer.readUInt32LE(offset + 4)
    if (b > 0x001fffff) {
        throw new TypeError("Value out of range")
    }
    return b * 0x100000000 + a
}

const varIntSize = (value) =>
    value < 0xfd ? 1 : value <= 0xffff ? 3 : value <= 0xffffffff ? 5 : 9

const writeVarInt = (buffer, value, offset) => {
    if (value < 0xfd) {
        buffer.writeUInt8(value, offset)
        return offset + 1
    }
    if (value <= 0xffff) {
        buffer.writeUInt8(0xfd, offset)
        buffer.writeUInt16LE(value, offset + 1)
        return offset + 3
    }
    if (value <= 0xffffffff) {
        buffer.writeUInt8(0xfe, offset)
        buffer.writeUInt32LE(value, offset + 1)
        return offset + 5
    }
    throw new TypeError("VarInt too large")
}

const readVarInt = (buffer, offset) => {
    const first = buffer.readUInt8(offset)
    if (first < 0xfd) {
        return {value: first, size: 1}
    }
    if (first === 0xfd) {
        return {value: buffer.readUInt16LE(offset + 1), size: 3}
    }
    if (first === 0xfe) {
        return {value: buffer.readUInt32LE(offset + 1), size: 5}
    }
    throw new TypeError("VarInt too large")
}

const varSliceSize = (slice) => varIntSize(slice.length) + slice.length

class Transaction {
    constructor() {
        // 2, not upstream bitcoinjs's 1: the library this replaces sets 2 on
        // every fresh transaction, so everything the app has ever assembled
        // and broadcast is version 2. A different default here would change
        // the bytes and txid of every newly built transaction.
        this.version = 2
        this.locktime = 0
        this.ins = []
        this.outs = []
    }

    static fromBuffer(buffer) {
        let offset = 0
        const readSlice = (n) => {
            if (offset + n > buffer.length) {
                throw new Error("Transaction buffer too short")
            }
            const slice = buffer.slice(offset, offset + n)
            offset += n
            return slice
        }
        const readUInt32 = () => {
            const value = buffer.readUInt32LE(offset)
            offset += 4
            return value
        }
        const readVarIntHere = () => {
            const {value, size} = readVarInt(buffer, offset)
            offset += size
            return value
        }
        const readVarSlice = () => readSlice(readVarIntHere())

        const tx = new Transaction()
        tx.version = buffer.readInt32LE(offset)
        offset += 4
        // A zero input count here is the segwit marker byte. BCH rejected
        // segwit, so nothing valid on this chain serializes that way.
        if (buffer[offset] === 0x00 && buffer[offset + 1] === 0x01) {
            throw new Error("witness transactions are not supported")
        }
        const vinLength = readVarIntHere()
        for (let i = 0; i < vinLength; i++) {
            tx.ins.push({
                hash: readSlice(32),
                index: readUInt32(),
                script: readVarSlice(),
                sequence: readUInt32(),
            })
        }
        const voutLength = readVarIntHere()
        for (let i = 0; i < voutLength; i++) {
            const value = readUInt64LE(buffer, offset)
            offset += 8
            tx.outs.push({
                value: value,
                script: readVarSlice(),
            })
        }
        tx.locktime = readUInt32()
        if (offset !== buffer.length) {
            throw new Error("Transaction has unexpected data")
        }
        return tx
    }

    static fromHex(hex) {
        return Transaction.fromBuffer(Buffer.from(hex, "hex"))
    }

    addInput(hash, index, sequence = DEFAULT_SEQUENCE, script = Buffer.alloc(0)) {
        if (!Buffer.isBuffer(hash) || hash.length !== 32) {
            throw new TypeError("Expected 32-byte hash")
        }
        return this.ins.push({hash, index, script, sequence}) - 1
    }

    addOutput(script, value) {
        if (!Buffer.isBuffer(script)) {
            throw new TypeError("Expected script Buffer")
        }
        return this.outs.push({script, value}) - 1
    }

    byteLength() {
        return 8 +
            varIntSize(this.ins.length) +
            varIntSize(this.outs.length) +
            this.ins.reduce((sum, input) => sum + 40 + varSliceSize(input.script), 0) +
            this.outs.reduce((sum, output) => sum + 8 + varSliceSize(output.script), 0)
    }

    toBuffer() {
        const buffer = Buffer.allocUnsafe(this.byteLength())
        let offset = 0
        buffer.writeInt32LE(this.version, offset)
        offset += 4
        offset = writeVarInt(buffer, this.ins.length, offset)
        for (const input of this.ins) {
            input.hash.copy(buffer, offset)
            offset += 32
            buffer.writeUInt32LE(input.index, offset)
            offset += 4
            offset = writeVarInt(buffer, input.script.length, offset)
            input.script.copy(buffer, offset)
            offset += input.script.length
            buffer.writeUInt32LE(input.sequence, offset)
            offset += 4
        }
        offset = writeVarInt(buffer, this.outs.length, offset)
        for (const output of this.outs) {
            offset = writeUInt64LE(buffer, output.value, offset)
            offset = writeVarInt(buffer, output.script.length, offset)
            output.script.copy(buffer, offset)
            offset += output.script.length
        }
        buffer.writeUInt32LE(this.locktime, offset)
        return buffer
    }

    toHex() {
        return this.toBuffer().toString("hex")
    }

    getHash() {
        return hash256(this.toBuffer())
    }

    getId() {
        // Transaction hashes are displayed in reverse byte order.
        return this.getHash().reverse().toString("hex")
    }

    clone() {
        const tx = new Transaction()
        tx.version = this.version
        tx.locktime = this.locktime
        tx.ins = this.ins.map(({hash, index, script, sequence}) => ({hash, index, script, sequence}))
        tx.outs = this.outs.map(({script, value}) => ({script, value}))
        return tx
    }

    // The BIP143 preimage BCH adopted as its replay-protected sighash. The
    // input scripts play no part in it, so inputs can be signed in any order
    // against the same unsigned transaction.
    hashForCashSignature(inIndex, prevOutScript, value, hashType) {
        if (!(hashType & SIGHASH_BITCOINCASHBIP143)) {
            throw new Error("legacy sighash is not supported: BCH requires the forkid bit")
        }
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new Error("Bitcoin Cash sighash requires value of input to be signed.")
        }
        const zero = Buffer.alloc(32)
        let hashPrevouts = zero
        let hashSequence = zero
        let hashOutputs = zero

        if (!(hashType & SIGHASH_ANYONECANPAY)) {
            const buffer = Buffer.allocUnsafe(36 * this.ins.length)
            let offset = 0
            for (const input of this.ins) {
                input.hash.copy(buffer, offset)
                offset += 32
                buffer.writeUInt32LE(input.index, offset)
                offset += 4
            }
            hashPrevouts = hash256(buffer)
        }
        if (!(hashType & SIGHASH_ANYONECANPAY) &&
            (hashType & 0x1f) !== SIGHASH_SINGLE && (hashType & 0x1f) !== SIGHASH_NONE) {
            const buffer = Buffer.allocUnsafe(4 * this.ins.length)
            let offset = 0
            for (const input of this.ins) {
                buffer.writeUInt32LE(input.sequence, offset)
                offset += 4
            }
            hashSequence = hash256(buffer)
        }
        if ((hashType & 0x1f) !== SIGHASH_SINGLE && (hashType & 0x1f) !== SIGHASH_NONE) {
            const size = this.outs.reduce((sum, output) => sum + 8 + varSliceSize(output.script), 0)
            const buffer = Buffer.allocUnsafe(size)
            let offset = 0
            for (const output of this.outs) {
                offset = writeUInt64LE(buffer, output.value, offset)
                offset = writeVarInt(buffer, output.script.length, offset)
                output.script.copy(buffer, offset)
                offset += output.script.length
            }
            hashOutputs = hash256(buffer)
        } else if ((hashType & 0x1f) === SIGHASH_SINGLE && inIndex < this.outs.length) {
            const output = this.outs[inIndex]
            const buffer = Buffer.allocUnsafe(8 + varSliceSize(output.script))
            let offset = writeUInt64LE(buffer, output.value, 0)
            offset = writeVarInt(buffer, output.script.length, offset)
            output.script.copy(buffer, offset)
            hashOutputs = hash256(buffer)
        }

        const input = this.ins[inIndex]
        const preimage = Buffer.allocUnsafe(156 + varSliceSize(prevOutScript))
        let offset = 0
        preimage.writeInt32LE(this.version, offset)
        offset += 4
        hashPrevouts.copy(preimage, offset)
        offset += 32
        hashSequence.copy(preimage, offset)
        offset += 32
        input.hash.copy(preimage, offset)
        offset += 32
        preimage.writeUInt32LE(input.index, offset)
        offset += 4
        offset = writeVarInt(preimage, prevOutScript.length, offset)
        prevOutScript.copy(preimage, offset)
        offset += prevOutScript.length
        offset = writeUInt64LE(preimage, value, offset)
        preimage.writeUInt32LE(input.sequence, offset)
        offset += 4
        hashOutputs.copy(preimage, offset)
        offset += 32
        preimage.writeUInt32LE(this.locktime, offset)
        offset += 4
        preimage.writeUInt32LE(hashType >>> 0, offset)
        return hash256(preimage)
    }
}

Transaction.DEFAULT_SEQUENCE = DEFAULT_SEQUENCE
Transaction.SIGHASH_ALL = SIGHASH_ALL
Transaction.SIGHASH_BITCOINCASHBIP143 = SIGHASH_BITCOINCASHBIP143

module.exports = {
    Transaction: Transaction,
}
