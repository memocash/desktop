import bitcoin from "./bitcoin";
import {GetUtxosRef} from "./utxos";

const GetMaxValue = () => {
    const utxosRef = GetUtxosRef()
    let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
    for (let i = 0; i < utxosRef.current.value.length; i++) {
        totalUtxoValue += utxosRef.current.value[i].value - bitcoin.Fee.InputP2PKH
    }
    return totalUtxoValue
}

export {
    GetMaxValue,
}
