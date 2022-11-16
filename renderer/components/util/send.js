import bitcoin from "./bitcoin";
import {GetUtxosRef} from "./utxos";

const GetMaxValue = async (coin="") => {
    return new Promise(async (resolve) => {
        const check = (coin="") => {
            if (coin.toString() === "") {
                const utxosRef = GetUtxosRef()
                if (!utxosRef.current.value) {
                    setTimeout(check, 100)
                    return
                }
                let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
                for (let i = 0; i < utxosRef.current.value.length; i++) {
                    totalUtxoValue += utxosRef.current.value[i].value - bitcoin.Fee.InputP2PKH
                }
                resolve(totalUtxoValue)
            }
            else{
                let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
                const value = coin.toString().split(":")[2]
                totalUtxoValue += parseInt(value) - bitcoin.Fee.InputP2PKH
                resolve(totalUtxoValue)
            }
        }
        check(coin)
    })
}

export {
    GetMaxValue,
}
