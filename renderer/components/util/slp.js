// Formats a raw SLP amount using the token's decimals without going through
// floats, since token amounts can exceed float precision.
const FormatTokenAmount = (amount, decimals) => {
    if (amount === undefined || amount === null) {
        return ""
    }
    decimals = decimals || 0
    let str = amount.toLocaleString("fullwide", {useGrouping: false})
    if (!decimals) {
        return Number(str).toLocaleString()
    }
    while (str.length <= decimals) {
        str = "0" + str
    }
    const whole = str.slice(0, -decimals)
    const frac = str.slice(-decimals).replace(/0+$/, "")
    return Number(whole).toLocaleString() + (frac.length ? "." + frac : "")
}

export {
    FormatTokenAmount,
}
