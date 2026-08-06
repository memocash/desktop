// The transaction-shaped arithmetic, in commonjs so node's test runner can
// require it directly - the pattern router_core and linkify set. The builders
// in wallet/snippets are ESM under a JSX import chain only the bundler loads,
// so the selection logic they share lives here, taking the utxo list and the
// change script as plain inputs.

const Fee = {
    Base: 10,
    InputP2PKH: 148,
    OutputP2PKH: 34,
    OutputFeeOpReturn: 20,
    OutputValueSize: 9, // 8 + 1
    DustLimit: 546,
    TxHashByteLength: 32,
    OpPushDataBase: 3,
    MaxOpReturn: 217,
    MaxOpReturnBsv: 100000,
    GetMaxContentWithTxHash: () => {
        return Fee.MaxOpReturn - Fee.OpPushDataBase - Fee.TxHashByteLength
    },
}

// Whether a utxo may fund an ordinary spend. Token outputs and mint batons
// would burn what they carry, and an exactly-dust output could be a token
// output the SLP check has not reached yet. Every selection site uses this one
// predicate - BuildTx below, EstimateSend and GetMaxValue in util/send.js, the
// fee loop in wallet/snippets/create_slp_tx.js - so they cannot drift.
const Spendable = (utxo) =>
    !utxo.slp_token_hash && !utxo.slp_baton_token_hash && utxo.value !== Fee.DustLimit

// Input selection and output assembly shared by the preview and direct paths -
// one copy so the two transactions a setting toggles between cannot drift.
// EstimateSend below mirrors this selection for the pre-sign summary; keep it
// in step if selection changes.
//
// fromAddress restricts inputs to utxos locked to that address. Link accepts
// and revokes need it: the protocol attributes them to the signing address,
// which must be the exact address the link names - funds from another wallet
// address would make the action invalid.
//
// Returns {inputs, outputs} ready to sign, or null when the utxos cannot fund
// the outputs - including a named coin that must not carry the send
// (token/baton/dust) or cannot fund it on its own.
const BuildTx = ({utxos, outputs, coin = "", fromAddress = "", changeScript}) => {
    if (fromAddress !== "") {
        utxos = utxos.filter(utxo => utxo.address === fromAddress)
    }
    let requiredInput = Fee.Base
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (parseInt(value) || 0) + Fee.OutputValueSize
    }
    let totalInput = 0
    let inputs = []
    for (let i = 0; i < utxos.length; i++) {
        if (i === 0 && coin !== "") {
            // A named coin is the whole selection: it funds the outputs on its
            // own or the send fails. Substituting other coins for a coin the
            // user named would spend what they explicitly did not choose - the
            // send form refuses token/dust coins before this runs (see
            // CoinProblem), so these checks are the backstop, not the message.
            //
            // The name only locates the coin: it must resolve to a utxo the
            // wallet holds, inside any fromAddress restriction, and the utxo -
            // never the string - supplies the value and address, the same
            // stance ResolveCoin takes for the estimate. A stale or edited
            // string is a coin the wallet does not have, which is a funding
            // failure, not an input.
            const [coinHash, coinIndex] = coin.split(":")
            const coinUtxo = utxos.find(u => u.hash === coinHash && u.index === parseInt(coinIndex))
            if (!coinUtxo) {
                break
            }
            if (!Spendable(coinUtxo)) {
                // A token output, mint baton, or unchecked dust: spending it
                // could burn tokens, so the send fails instead.
                break
            }
            requiredInput += Fee.InputP2PKH
            totalInput += coinUtxo.value
            if (totalInput === requiredInput ||
                totalInput > requiredInput + Fee.OutputP2PKH + Fee.DustLimit) {
                inputs.push([coinUtxo.hash, coinUtxo.index, coinUtxo.value, coinUtxo.address].join(":"))
            }
            break
        }
        const utxo = utxos[i]
        if (!Spendable(utxo)) {
            continue
        }
        inputs.push([utxo.hash, utxo.index, utxo.value, utxo.address].join(":"))
        requiredInput += Fee.InputP2PKH
        totalInput += parseInt(utxo.value)
        if (totalInput === requiredInput ||
            totalInput > requiredInput + Fee.OutputP2PKH + Fee.DustLimit) {
            break
        }
    }
    // A named coin can charge its value without being added as an input: when
    // it lands in the band where it covers the outputs but the leftover would
    // be dust, nothing is selected. The inputs check catches that as the
    // refusal it is, where the value comparison alone would let an empty
    // transaction through.
    if (totalInput < requiredInput || !inputs.length) {
        return null
    }
    // Change below the dust limit is an output no node would relay, so the
    // whole transaction would sit unbroadcastable; that leftover rides as fee
    // instead. Only reachable when the eligible utxos ran out inside the stop
    // band above - the loop otherwise keeps adding until the change clears
    // dust, and the named-coin branch refuses the band outright.
    const change = totalInput - requiredInput - Fee.OutputP2PKH
    let outputStrings = []
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        outputStrings.push(script.toString("hex") + ":" + (value ? value : 0).toString())
    }
    if (change >= Fee.DustLimit) {
        outputStrings.push(changeScript + ":" + change)
    }
    return {inputs, outputs: outputStrings}
}

// Reasons a named coin cannot be used as a transaction's input. Anything other
// than Ok has to block sending, because the builders either refuse the coin or
// would build a transaction with no inputs at all.
const CoinStatus = {
    None: "none",           // field is empty, use normal selection
    Ok: "ok",
    Unknown: "unknown",     // not a coin this wallet holds (partial text, typo, spent)
    Token: "token",         // holds an SLP amount or a mint baton
    Dust: "dust",
}

// Looks a named coin up in a utxo set, given the "hash:index:value:address"
// text the Coins tab copies. The utxo is returned from the set rather than
// parsed out of the text, so a stale or edited value cannot feed the estimate
// or the transaction.
const ResolveCoinIn = (utxos, coin) => {
    const text = (coin || "").toString().trim()
    if (!text.length) {
        return {status: CoinStatus.None, utxo: null}
    }
    const [hash, index] = text.split(":")
    const utxo = utxos.find(u => u.hash === hash && u.index === parseInt(index))
    if (!utxo) {
        return {status: CoinStatus.Unknown, utxo: null}
    }
    if (utxo.slp_token_hash || utxo.slp_baton_token_hash) {
        return {status: CoinStatus.Token, utxo}
    }
    if (utxo.value === Fee.DustLimit) {
        return {status: CoinStatus.Dust, utxo}
    }
    return {status: CoinStatus.Ok, utxo}
}

// The most a single payment output can carry from these utxos. Counts only
// what BuildTx will actually select - a token, baton, or dust coin never
// becomes an input, so counting its value would advertise a maximum the
// wallet then refuses to fund. extraOutputScripts are additional outputs the
// transaction will carry beyond the single payment already accounted for
// (e.g. a Like OP_RETURN); their fee comes off the maximum too.
const MaxSendValue = (utxos, coin = "", extraOutputScripts = []) => {
    let total = -Fee.Base - Fee.OutputP2PKH
    for (let i = 0; i < extraOutputScripts.length; i++) {
        total -= extraOutputScripts[i].length + Fee.OutputValueSize
    }
    const {status, utxo} = ResolveCoinIn(utxos, coin)
    if (utxo && status === CoinStatus.Ok) {
        return total + utxo.value - Fee.InputP2PKH
    }
    for (let i = 0; i < utxos.length; i++) {
        if (Spendable(utxos[i])) {
            total += utxos[i].value - Fee.InputP2PKH
        }
    }
    return total
}

// Whether the builders will actually take a single input of totalInput against
// these outputs. BuildTx only adds the named coin when it funds the outputs
// exactly or leaves more than a dust change output; in the band between those
// two it adds no input at all, so anything in that band has to count as
// unusable rather than as a cheap send.
const CoinFunds = (totalInput, requiredInput) =>
    totalInput === requiredInput ||
    totalInput > requiredInput + Fee.OutputP2PKH + Fee.DustLimit

// What a set of outputs will actually cost to send. Mirrors the input
// selection in BuildTx so the figure shown before signing matches the
// transaction that gets built: a named coin is spent on its own as the single
// input, otherwise utxos are taken in order until they cover the outputs plus
// fee. Keep in step with BuildTx if selection changes.
const EstimateSend = (utxos, outputs, coin = "") => {
    let requiredInput = Fee.Base
    let outputValue = 0
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        const outValue = parseInt(value) || 0
        requiredInput += script.length + outValue + Fee.OutputValueSize
        outputValue += outValue
    }
    let totalInput = 0
    let inputCount = 0
    let enough
    const {status, utxo} = ResolveCoinIn(utxos, coin)
    // A coin that does not resolve is costed as an ordinary send so the summary
    // stays quiet while the field is being typed into. It is the form's job to
    // refuse to submit it - see the coin checks in Send's validate().
    if (utxo && status !== CoinStatus.Token && status !== CoinStatus.Dust) {
        // Naming a coin restricts the transaction to that one output, so the
        // input count is fixed at one however much the rest of the wallet holds.
        inputCount = 1
        requiredInput += Fee.InputP2PKH
        totalInput = utxo.value
        enough = CoinFunds(totalInput, requiredInput)
    } else {
        for (let i = 0; i < utxos.length; i++) {
            if (!Spendable(utxos[i])) {
                continue
            }
            inputCount++
            requiredInput += Fee.InputP2PKH
            totalInput += parseInt(utxos[i].value)
            if (totalInput === requiredInput ||
                totalInput > requiredInput + Fee.OutputP2PKH + Fee.DustLimit) {
                break
            }
        }
        enough = totalInput >= requiredInput
    }
    // Everything the inputs cover beyond the outputs is fee. A change output
    // exists only when it clears the dust limit (mirror BuildTx); a smaller
    // surplus rides as fee, so it is part of the figure shown.
    const surplus = totalInput - requiredInput
    let fee = requiredInput - outputValue
    if (enough) {
        fee += surplus >= Fee.OutputP2PKH + Fee.DustLimit ? Fee.OutputP2PKH : surplus
    }
    return {fee, inputCount, enough, total: outputValue + fee}
}

// Completes a transaction whose special-purpose inputs and outputs are already
// in place - an SLP send's token inputs and dust outputs - by adding spendable
// utxos until the BCH fee is covered, largest first, then appending whatever
// change clears the dust limit. The same stop band and change rule as BuildTx.
// Returns {inputs, outputs} ready to sign, or null when the utxos cannot cover
// what the outputs need.
const CompleteTx = ({utxos, inputs = [], totalInput = 0, outputs, changeScript}) => {
    let requiredInput = Fee.Base + inputs.length * Fee.InputP2PKH
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (value || 0) + Fee.OutputValueSize
    }
    const feeUtxos = utxos.filter(Spendable).sort((a, b) => b.value - a.value)
    const taken = [...inputs]
    // Checked before adding rather than after: the inputs already in place may
    // cover the outputs on their own.
    for (let i = 0; i < feeUtxos.length; i++) {
        if (totalInput === requiredInput ||
            totalInput > requiredInput + Fee.OutputP2PKH + Fee.DustLimit) {
            break
        }
        taken.push([feeUtxos[i].hash, feeUtxos[i].index, feeUtxos[i].value, feeUtxos[i].address].join(":"))
        requiredInput += Fee.InputP2PKH
        totalInput += feeUtxos[i].value
    }
    if (totalInput < requiredInput) {
        return null
    }
    // Change below the dust limit rides as fee, the same rule as BuildTx.
    const change = totalInput - requiredInput - Fee.OutputP2PKH
    const outputStrings = outputs.map(({script, value}) =>
        script.toString("hex") + ":" + (value ? value : 0).toString())
    if (change >= Fee.DustLimit) {
        outputStrings.push(changeScript + ":" + change)
    }
    return {inputs: taken, outputs: outputStrings}
}

module.exports = {
    BuildTx,
    CoinStatus,
    CompleteTx,
    EstimateSend,
    Fee,
    MaxSendValue,
    ResolveCoinIn,
    Spendable,
}
