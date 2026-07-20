import bitcoin from "./bitcoin";
import {GetUtxos} from "./utxos";

// extraOutputScripts are additional outputs the transaction will carry beyond
// the single P2PKH payment already accounted for (e.g. a Like OP_RETURN). Their
// fee must be subtracted from the max or the max overshoots available funds.
const GetMaxValue = async (coin = "", extraOutputScripts = []) => {
    return new Promise(async (resolve) => {
        const check = (coin = "") => {
            let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
            for (let i = 0; i < extraOutputScripts.length; i++) {
                totalUtxoValue -= extraOutputScripts[i].length + bitcoin.Fee.OutputValueSize
            }
            const coinStr = coin.toString()
            if (coinStr === "") {
                const utxos = GetUtxos()
                if (!utxos) {
                    setTimeout(check, 100)
                    return
                }
                for (let i = 0; i < utxos.length; i++) {
                    totalUtxoValue += utxos[i].value - bitcoin.Fee.InputP2PKH
                }
            } else {
                const value = coinStr.split(":")[2]
                totalUtxoValue += parseInt(value) - bitcoin.Fee.InputP2PKH
            }
            resolve(totalUtxoValue)
        }
        check(coin)
    })
}

export {
    GetMaxValue,
}
