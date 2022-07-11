import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";

const CreateTransaction = async (wallet, utxos, outputScript, outputValue, beatHash = "") => {
    let requiredInput = bitcoin.Fee.Base + outputScript.length + outputValue + bitcoin.Fee.OutputValueSize
    let totalInput = 0
    let inputs = []
    for (let i = 0; i < utxos.length; i++) {
        const utxo = utxos[i]
        inputs.push([utxo.hash, utxo.index, utxo.value, utxo.address].join(":"))
        requiredInput += bitcoin.Fee.InputP2PKH
        totalInput += parseInt(utxo.value)
        if (totalInput === requiredInput || totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.DustLimit) {
            break
        }
    }
    const changeAddress = wallet.addresses[0]
    const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - bitcoin.Fee.OutputP2PKH
    let outputs = [
        outputScript.toString("hex") + ":" + outputValue.toString(),
        address.toOutputScript(changeAddress).toString("hex") + ":" + change,
    ]
    await window.electron.openPreviewSend({inputs, outputs, beatHash})
}

export {
    CreateTransaction,
}
