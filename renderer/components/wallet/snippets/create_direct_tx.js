import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {GetUtxosRef} from "../../util/utxos";
import {DirectTx} from "../../tx/direct_tx";

const CreateDirectTransaction = async (wallet,coin, outputs, setModal,onDone, beatHash="", requirePassword) => {
    const utxos = GetUtxosRef().current.value
    console.log(utxos)
    let requiredInput = bitcoin.Fee.Base
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (parseInt(value) || 0) + bitcoin.Fee.OutputValueSize
    }
    let totalInput = 0
    let inputs = []
    for (let i = 0; i < utxos.length; i++) {
        if(i == 0 && coin !== ""){
            //separate utxo by : and get the value
            const value = coin.split(":")[2]
            if (value === bitcoin.Fee.DustLimit) {
                // Don't spend dust outputs, could be SLP token, which isn't supported yet
                continue
            }
            requiredInput += bitcoin.Fee.InputP2PKH
            totalInput += parseInt(value)
            if (totalInput === requiredInput ||
                totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.Fee.DustLimit) {
                inputs.push(coin)
                break
            }
            break
        }
        const utxo = utxos[i]
        if (utxo.value === bitcoin.Fee.DustLimit) {
            // Don't spend dust outputs, could be SLP token, which isn't supported yet
            continue
        }
        inputs.push([utxo.hash, utxo.index, utxo.value, utxo.address].join(":"))
        requiredInput += bitcoin.Fee.InputP2PKH
        totalInput += parseInt(utxo.value)
        if (totalInput === requiredInput ||
            totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.Fee.DustLimit) {
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
    await DirectTx(inputs, outputStrings, beatHash, setModal, onDone,requirePassword)
}

export {
    CreateDirectTransaction,
}
