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

export {
    FormatTokenAmount,
    FormatTokenAmountPlain,
    ParseTokenAmount,
}
