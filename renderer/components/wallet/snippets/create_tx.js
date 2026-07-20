import bitcoin from "../../util/bitcoin";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {GetUtxos} from "../../util/utxos";
import {CreateDirectTransaction} from "./create_direct_tx";

// fromAddress restricts inputs to utxos locked to that address. Link accepts
// and revokes need it: the protocol attributes them to the signing address,
// which must be the exact address the link names - funds from another wallet
// address would make the action invalid.
const CreateTransactionWithPreview = async (wallet, outputs, beatHash = "", coin = "", fromAddress = "") => {
    let utxos = GetUtxos()
    if (fromAddress !== "") {
        utxos = utxos.filter(utxo => utxo.address === fromAddress)
    }
    let requiredInput = bitcoin.Fee.Base
    for (let i = 0; i < outputs.length; i++) {
        const {script, value} = outputs[i]
        requiredInput += script.length + (parseInt(value) || 0) + bitcoin.Fee.OutputValueSize
    }
    let totalInput = 0
    let inputs = []
    for (let i = 0; i < utxos.length; i++) {
        if (i === 0 && coin !== "") {
            //separate utxo by : and get the value
            const [coinHash, coinIndex, value] = coin.split(":")
            const coinUtxo = utxos.find(u => u.hash === coinHash && u.index === parseInt(coinIndex))
            if (coinUtxo && (coinUtxo.slp_token_hash || coinUtxo.slp_baton_token_hash)) {
                // Don't spend SLP token outputs or mint batons, would burn the tokens
                break
            }
            if (parseInt(value) === bitcoin.Fee.DustLimit) {
                // Don't spend dust outputs, could be an SLP token that hasn't been checked yet
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
        if (utxo.slp_token_hash || utxo.slp_baton_token_hash) {
            // Don't spend SLP token outputs or mint batons, would burn the tokens
            continue
        }
        if (utxo.value === bitcoin.Fee.DustLimit) {
            // Don't spend dust outputs, could be an SLP token that hasn't been checked yet
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
    if (totalInput < requiredInput) {
        window.electron.showMessageDialog(fromAddress !== "" ?
            "Not enough value on " + fromAddress + " to complete this transaction" :
            "Not enough value in wallet to complete this transaction")
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

const CreateTransaction = async (wallet, outputs, setModal, onDone, beatHash = "", requirePassword = false,
                                 fromAddress = "") => {
    if (wallet.settings.DirectTx) {
        await CreateDirectTransaction(wallet, outputs, setModal, onDone, requirePassword, beatHash, "", fromAddress)
    } else {
        await CreateTransactionWithPreview(wallet, outputs, beatHash, "", fromAddress)
    }
}

export {
    CreateTransaction,
    CreateTransactionWithPreview
}
