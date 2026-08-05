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

// Input selection and output assembly shared by the preview and direct paths -
// one copy so the two transactions a setting toggles between cannot drift.
// EstimateSend in util/send.js mirrors this selection for the pre-sign
// summary; keep it in step if selection changes.
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
            if (coinUtxo.slp_token_hash || coinUtxo.slp_baton_token_hash) {
                // Don't spend SLP token outputs or mint batons, would burn the tokens
                break
            }
            if (coinUtxo.value === Fee.DustLimit) {
                // Don't spend dust outputs, could be an SLP token that hasn't been checked yet
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
        if (utxo.slp_token_hash || utxo.slp_baton_token_hash) {
            // Don't spend SLP token outputs or mint batons, would burn the tokens
            continue
        }
        if (utxo.value === Fee.DustLimit) {
            // Don't spend dust outputs, could be an SLP token that hasn't been checked yet
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
    const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - Fee.OutputP2PKH
    let outputStrings = []
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        outputStrings.push(script.toString("hex") + ":" + (value ? value : 0).toString())
    }
    if (change > 0) {
        outputStrings.push(changeScript + ":" + change)
    }
    return {inputs, outputs: outputStrings}
}

module.exports = {BuildTx, Fee}
