import bitcoin from "./bitcoin";
import {GetUtxos} from "./utxos";

const GetMaxValue = async (coin = "") => {
    return new Promise(async (resolve) => {
        const check = (coin = "") => {
            let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
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
