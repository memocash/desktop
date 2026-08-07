import {CoinStatus, EstimateSend as Estimate, MaxSendValue, ResolveCoinIn} from "./tx_build";
import {GetUtxos} from "./utxos";

// The arithmetic lives in util/tx_build (commonjs, tested directly); these
// wrappers supply the wallet's utxo set and own the waiting for it to load.

// Looks a named coin up in the wallet's own utxo set, given the
// "hash:index:value:address" text the Coins tab copies.
const ResolveCoin = (coin) => ResolveCoinIn(GetUtxos() || [], coin)

// The canonical coin string for a resolved utxo, in the form the builders
// expect. Built from wallet data, never from what was typed.
const CoinString = (utxo) => [utxo.hash, utxo.index, utxo.value, utxo.address].join(":")

const GetMaxValue = async (coin = "", extraOutputScripts = []) => {
    return new Promise((resolve) => {
        const check = () => {
            const utxos = GetUtxos()
            if (!utxos) {
                setTimeout(check, 100)
                return
            }
            resolve(MaxSendValue(utxos, coin, extraOutputScripts))
        }
        check()
    })
}

const EstimateSend = (outputs, coin = "") => Estimate(GetUtxos() || [], outputs, coin)

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
