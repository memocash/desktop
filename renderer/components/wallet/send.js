import {useEffect, useRef} from "react";
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import form from "../../styles/form.module.css"
import bitcoin from "../util/bitcoin";
import GetWallet from "../util/wallet";
import {useReferredState} from "../util/state";

const Send = () => {
    const payToRef = useRef("")
    const messageRef = useRef("")
    const amountRef = useRef(0)
    const utxosRef = useRef([])
    const [maxValue, maxValueRef, setMaxValue] = useReferredState(0)
    useEffect(async () => {
        const wallet = await GetWallet()
        utxosRef.current.value = await window.electron.getUtxos(wallet.addresses)
        utxosRef.current.value.sort((a, b) => {
            return b.value - a.value
        })
        calcAndSetMaxValue()
    }, [])
    const calcAndSetMaxValue = () => {
        let totalUtxoValue = -bitcoin.Fee.Base - bitcoin.Fee.OutputP2PKH
        for (let i = 0; i < utxosRef.current.value.length; i++) {
            totalUtxoValue += utxosRef.current.value[i].value - bitcoin.Fee.InputP2PKH
        }
        setMaxValue(Math.max(0, totalUtxoValue))
    }
    const onAmountChange = (e) => {
        let {value, min, max} = e.target;
        if (!value) {
            return
        }
        e.target.value = Math.max(Number(min), Math.min(Number(max), Number(value)));
    }
    const onClickMax = () => {
        calcAndSetMaxValue()
        amountRef.current.value = maxValueRef.current
    }
    const formSubmit = async (e) => {
        e.preventDefault()
        if (maxValueRef.current < bitcoin.DustLimit) {
            window.electron.showMessageDialog("Not enough value in wallet to create a transaction")
            return
        }
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
        let requiredInput = amount + bitcoin.Fee.Base + bitcoin.Fee.OutputP2PKH
        let totalInput = 0
        let inputs = []
        for (let i = 0; i < utxosRef.current.value.length; i++) {
            const utxo = utxosRef.current.value[i]
            inputs.push([utxo.hash, utxo.index, utxo.value, utxo.address].join(":"))
            requiredInput += bitcoin.Fee.InputP2PKH
            totalInput += parseInt(utxo.value)
            if (totalInput === requiredInput || totalInput > requiredInput + bitcoin.Fee.OutputP2PKH + bitcoin.DustLimit) {
                break
            }
        }
        const changeAddress = wallet.addresses[0]
        const change = totalInput === requiredInput ? 0 : totalInput - requiredInput - bitcoin.Fee.OutputP2PKH
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
                    <input className={form.input_small} ref={amountRef} type="number" max={maxValue}
                           min={0} onChange={onAmountChange}/>
                    <input type="button" value={"Max"} onClick={onClickMax}/>
                </label>
            </p>
            <p>
                <input type="submit" value="Preview"/>
            </p>
        </form>
    )
}

export default Send
