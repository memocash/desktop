import bitcoin from "./bitcoin";
import {GetUtxosRef} from "./utxos";

const GetMaxValue = async () => {
    return new Promise(async (resolve) => {
        const check = () => {
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
        check()
    })
}

export {
    GetMaxValue,
}
