import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {GetUtxosRef} from "../../util/utxos";

const CreateTransaction = async (wallet, outputs, beatHash = "") => {
    const utxos = GetUtxosRef().current.value
    let requiredInput = bitcoin.Fee.Base
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (value ? value : 0) + bitcoin.Fee.OutputValueSize
    }
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
    let outputStrings = []
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        outputStrings.push(script.toString("hex") + ":" + (value ? value : 0).toString())
    }
    if (change > 0) {
        outputStrings.push(address.toOutputScript(changeAddress).toString("hex") + ":" + change)
    }
    await window.electron.openPreviewSend({inputs, outputs: outputStrings, beatHash})
}

export {
    CreateTransaction,
}
