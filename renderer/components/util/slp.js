// Splits a raw SLP amount into whole/fraction strings using the token's
// decimals without going through floats, since token amounts can exceed float
// precision.
const splitTokenAmount = (amount, decimals) => {
    decimals = decimals || 0
    let str = amount.toLocaleString("fullwide", {useGrouping: false})
    if (!decimals) {
        return {whole: str, frac: ""}
    }
    while (str.length <= decimals) {
        str = "0" + str
    }
    return {
        whole: str.slice(0, -decimals),
        frac: str.slice(-decimals).replace(/0+$/, ""),
    }
}

const FormatTokenAmount = (amount, decimals) => {
    if (amount === undefined || amount === null) {
        return ""
    }
    const {whole, frac} = splitTokenAmount(amount, decimals)
    return Number(whole).toLocaleString() + (frac.length ? "." + frac : "")
}

// Same as FormatTokenAmount but without thousands grouping, so the result can
// be fed back into ParseTokenAmount (e.g. for the Max button).
const FormatTokenAmountPlain = (amount, decimals) => {
    if (amount === undefined || amount === null) {
        return ""
    }
    const {whole, frac} = splitTokenAmount(amount, decimals)
    return whole + (frac.length ? "." + frac : "")
}

// Parses a user-entered decimal token amount into base units as a BigInt.
// Returns null if the input isn't a valid amount for the given decimals.
const ParseTokenAmount = (str, decimals) => {
    decimals = decimals || 0
    str = (str || "").trim()
    if (!/^\d+(\.\d+)?$/.test(str)) {
        return null
    }
    const [whole, frac = ""] = str.split(".")
    if (frac.length > decimals) {
        return null
    }
    return BigInt(whole + frac.padEnd(decimals, "0"))
}

// Parses an SLP OP_RETURN script (hex) into its fields, returning null if it
// isn't a valid-looking SLP message. Amounts are BigInts in base units (null
// for empty pushes). SLP requires every field to be a real push — opcodes like
// OP_0/OP_1 are invalid — so only 0x01-0x4b, PUSHDATA1 and PUSHDATA2 are
// accepted.
const ParseSlpScript = (scriptHex) => {
    const buf = Buffer.from(scriptHex, "hex")
    if (buf.length < 6 || buf[0] !== 0x6a) {
        return null
    }
    let pushes = []
    for (let i = 1; i < buf.length;) {
        const op = buf[i]
        let len, start
        if (op >= 0x01 && op <= 0x4b) {
            len = op
            start = i + 1
        } else if (op === 0x4c) {
            len = buf[i + 1]
            start = i + 2
        } else if (op === 0x4d) {
            len = buf[i + 1] | (buf[i + 2] << 8)
            start = i + 3
        } else {
            return null
        }
        if (start + len > buf.length) {
            return null
        }
        pushes.push(buf.slice(start, start + len))
        i = start + len
    }
    if (pushes.length < 3 || pushes[0].toString("hex") !== "534c5000") {
        return null
    }
    const amount = (push) => push.length ? BigInt("0x" + push.toString("hex")) : null
    const tokenType = pushes[1].length ? pushes[1][pushes[1].length - 1] : null
    const txType = pushes[2].toString("ascii")
    if (txType === "SEND" && pushes.length >= 5 && pushes[3].length === 32) {
        return {
            tokenType,
            txType,
            tokenHash: pushes[3].toString("hex"),
            amounts: pushes.slice(4).map(amount),
        }
    }
    if (txType === "MINT" && pushes.length >= 6 && pushes[3].length === 32) {
        return {
            tokenType,
            txType,
            tokenHash: pushes[3].toString("hex"),
            batonVout: pushes[4].length ? pushes[4][0] : null,
            amounts: [amount(pushes[5])],
        }
    }
    if (txType === "GENESIS" && pushes.length >= 10) {
        return {
            tokenType,
            txType,
            ticker: pushes[3].toString("utf8"),
            name: pushes[4].toString("utf8"),
            docUrl: pushes[5].toString("utf8"),
            decimals: pushes[7].length ? pushes[7][0] : 0,
            batonVout: pushes[8].length ? pushes[8][0] : null,
            amounts: [amount(pushes[9])],
        }
    }
    return null
}

export {
    FormatTokenAmount,
    FormatTokenAmountPlain,
    ParseTokenAmount,
    ParseSlpScript,
}
