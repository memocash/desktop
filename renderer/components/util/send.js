import bitcoin from "./bitcoin";
import {GetUtxos} from "./utxos";

// Reasons a named coin cannot be used as a transaction's input. Anything other
// than CoinOk has to block sending, because the builders either refuse the coin
// or would build a transaction with no inputs at all.
const CoinStatus = {
    None: "none",           // field is empty, use normal selection
    Ok: "ok",
    Unknown: "unknown",     // not a coin this wallet holds (partial text, typo, spent)
    Token: "token",         // holds an SLP amount or a mint baton
    Dust: "dust",
}

// Looks a named coin up in the wallet's own utxo set, given the
// "hash:index:value:address" text the Coins tab copies. The utxo is returned
// from the wallet rather than parsed out of the text, so a stale or edited
// value cannot feed the estimate or the transaction.
const ResolveCoin = (coin) => {
    const text = (coin || "").toString().trim()
    if (!text.length) {
        return {status: CoinStatus.None, utxo: null}
    }
    const [hash, index] = text.split(":")
    const utxo = (GetUtxos() || []).find(u => u.hash === hash && u.index === parseInt(index))
    if (!utxo) {
        return {status: CoinStatus.Unknown, utxo: null}
    }
    if (utxo.slp_token_hash || utxo.slp_baton_token_hash) {
        return {status: CoinStatus.Token, utxo}
    }
    if (utxo.value === bitcoin.Fee.DustLimit) {
        return {status: CoinStatus.Dust, utxo}
    }
    return {status: CoinStatus.Ok, utxo}
}

// The canonical coin string for a resolved utxo, in the form the builders
// expect. Built from wallet data, never from what was typed.
const CoinString = (utxo) => [utxo.hash, utxo.index, utxo.value, utxo.address].join(":")

// extraOutputScripts are additional outputs the transaction will carry beyond
// the single P2PKH payment already accounted for (e.g. a Like OP_RETURN). Their
// fee must be subtracted from the max or the max overshoots available funds.
const GetMaxValue = async (coin = "", extraOutputScripts = []) => {
    return new Promise(async (resolve) => {
        const check = () => {
            let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
            for (let i = 0; i < extraOutputScripts.length; i++) {
                totalUtxoValue -= extraOutputScripts[i].length + bitcoin.Fee.OutputValueSize
            }
            const utxos = GetUtxos()
            if (!utxos) {
                setTimeout(check, 100)
                return
            }
            const {utxo} = ResolveCoin(coin)
            if (utxo) {
                totalUtxoValue += utxo.value - bitcoin.Fee.InputP2PKH
            } else {
                for (let i = 0; i < utxos.length; i++) {
                    totalUtxoValue += utxos[i].value - bitcoin.Fee.InputP2PKH
                }
            }
            resolve(totalUtxoValue)
        }
        check()
    })
}

// Whether the builders will actually take a single input of totalInput against
// these outputs. BuildTx (util/tx_build) only
// add the input when it funds the outputs exactly or leaves more than a dust
// change output; in the band between those two they add no input at all, so
// anything in that band has to count as unusable rather than as a cheap send.
const CoinFunds = (totalInput, requiredInput) =>
    totalInput === requiredInput ||
    totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.Fee.DustLimit

// What a set of outputs will actually cost to send. Mirrors the input selection
// in BuildTx (util/tx_build) so the figure shown
// before signing matches the transaction that gets built: a named coin is spent
// on its own as the single input, otherwise the largest utxos are taken in turn
// (skipping token outputs and dust) until they cover the outputs plus fee. Keep
// in step with those two if selection changes.
const EstimateSend = (outputs, coin = "") => {
    let requiredInput = bitcoin.Fee.Base
    let outputValue = 0
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        const outValue = parseInt(value) || 0
        requiredInput += script.length + outValue + bitcoin.Fee.OutputValueSize
        outputValue += outValue
    }
    let totalInput = 0
    let inputCount = 0
    let enough
    const {status, utxo} = ResolveCoin(coin)
    // A coin that does not resolve is costed as an ordinary send so the summary
    // stays quiet while the field is being typed into. It is the form's job to
    // refuse to submit it - see the coin checks in Send's validate().
    if (utxo && status !== CoinStatus.Token && status !== CoinStatus.Dust) {
        // Naming a coin restricts the transaction to that one output, so the
        // input count is fixed at one however much the rest of the wallet holds.
        inputCount = 1
        requiredInput += bitcoin.Fee.InputP2PKH
        totalInput = utxo.value
        enough = CoinFunds(totalInput, requiredInput)
    } else {
        const utxos = GetUtxos() || []
        for (let i = 0; i < utxos.length; i++) {
            const utxo = utxos[i]
            if (utxo.slp_token_hash || utxo.slp_baton_token_hash || utxo.value === bitcoin.Fee.DustLimit) {
                continue
            }
            inputCount++
            requiredInput += bitcoin.Fee.InputP2PKH
            totalInput += parseInt(utxo.value)
            if (totalInput === requiredInput ||
                totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.Fee.DustLimit) {
                break
            }
        }
        enough = totalInput >= requiredInput
    }
    const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - bitcoin.Fee.OutputP2PKH
    // Everything the inputs cover beyond the outputs is fee, including the
    // change output's own cost when there is change.
    const fee = requiredInput - outputValue + (change > 0 ? bitcoin.Fee.OutputP2PKH : 0)
    return {fee, inputCount, enough, total: outputValue + fee}
}

// Why a named coin cannot be used for these outputs, or null when it can (or
// when no coin is named). Drives both the field message and the submit block.
const CoinProblem = (outputs, coin) => {
    const {status, utxo} = ResolveCoin(coin)
    switch (status) {
        case CoinStatus.None:
        case CoinStatus.Ok:
            break
        case CoinStatus.Token:
            return "This coin holds a token and cannot be spent here"
        case CoinStatus.Dust:
            return "This coin is dust and cannot be spent"
        default:
            return "Not a spendable coin in this wallet. Copy one from the Coins tab."
    }
    if (!utxo) {
        return null
    }
    return EstimateSend(outputs, coin).enough ? null :
        "This coin does not cover the amount plus fee, or would leave only dust change"
}

export {
    CoinProblem,
    CoinString,
    EstimateSend,
    GetMaxValue,
    ResolveCoin,
}
