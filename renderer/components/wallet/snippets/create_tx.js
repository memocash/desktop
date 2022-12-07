import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {GetUtxosRef} from "../../util/utxos";
import {CreateDirectTransaction} from "./create_direct_tx";

const CreateTransactionWithPreview = async (wallet,outputs, beatHash = "",coin = "") => {
    const utxos = GetUtxosRef().current.value
    let requiredInput = bitcoin.Fee.Base
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (parseInt(value) || 0) + bitcoin.Fee.OutputValueSize
    }
    let totalInput = 0
    let inputs = []
    for (let i = 0; i < utxos.length; i++) {
        if(i == 0 && coin !== "") {
            //separate utxo by : and get the value
            const value = coin.split(":")[2]
            if (value === bitcoin.Fee.DustLimit) {
                // Don't spend dust outputs, could be SLP token, which isn't supported yet
                break
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
    if(totalInput < requiredInput){
        window.electron.showMessageDialog("Not enough value in wallet to complete this transaction")
        return
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

const CreateTransaction = async (wallet, outputs, setModal, onDone, beatHash = "", requirePassword=false) => {
    if(wallet.settings.DirectTx){
        await CreateDirectTransaction(wallet, outputs, setModal,onDone,requirePassword, beatHash)
    }
    else{
        await CreateTransactionWithPreview(wallet, outputs, beatHash)
    }
}

export {
    CreateTransaction,
    CreateTransactionWithPreview
}
