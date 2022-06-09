import {useRef} from "react";

const {address} = require("@bitcoin-dot-com/bitcoincashjs2-lib");
import form from "../../styles/form.module.css"
import bitcoin from "../util/bitcoin";
import GetWallet from "../util/wallet";

const Send = () => {
    const payToRef = useRef("")
    const messageRef = useRef("")
    const amountRef = useRef(0)
    const formSubmit = async (e) => {
        e.preventDefault()
        const payTo = payToRef.current.value
        const message = messageRef.current.value
        const amount = parseInt(amountRef.current.value)
        try {
            address.fromBase58Check(payTo)
        } catch (err) {
            window.electron.showMessageDialog("Unable to parse address: " + err.toString())
            return
        }
        if (message && message.length > bitcoin.MaxOpReturn) {
            window.electron.showMessageDialog("Message length is too long (max: " + bitcoin.MaxOpReturn + ")")
            return
        }
        if (amount < bitcoin.DustLimit) {
            window.electron.showMessageDialog("Amount must be above dust limit (546)")
            return
        }
        const wallet = await GetWallet()
        const utxos = await window.electron.getUtxos(wallet.addresses)
        let requiredInput = amount + bitcoin.Fee.Base + bitcoin.Fee.OutputP2PKH * 2
        let totalInput = 0
        let inputs = []
        for (let i = 0; i < utxos.length; i++) {
            inputs.push([utxos[i].hash, utxos[i].index, utxos[i].value, utxos[i].address].join(":"))
            requiredInput += bitcoin.Fee.InputP2PKH
            totalInput += parseInt(utxos[i].value)
            if (totalInput > requiredInput + bitcoin.DustLimit) {
                break
            }
        }
        const changeAddress = wallet.addresses[0]
        const change = totalInput - requiredInput
        await window.electron.openPreviewSend({payTo, message, amount, inputs, changeAddress, change})
    }
    return (
        <form onSubmit={formSubmit}>
            <p>
                <label>
                    <span className={form.span}>Pay to:</span>
                    <input className={form.input} ref={payToRef} type="text" autoFocus spellCheck="false"/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Message (optional):</span>
                    <input className={form.input} ref={messageRef} type="text"/>
                </label>
            </p>
            <p>
                <label>
                    <span className={form.span}>Amount (sats):</span>
                    <input className={form.input_small} ref={amountRef} type="text"/>
                </label>
            </p>
            <p>
                <input type="submit" value="Preview"/>
            </p>
        </form>
    )
}

export default Send
