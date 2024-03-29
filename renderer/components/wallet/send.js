import {useEffect, useRef} from "react";
import {address, opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import form from "../../styles/form.module.css"
import bitcoin from "../util/bitcoin";
import GetWallet from "../util/wallet";
import {useReferredState} from "../util/state";
import {CreateTransactionWithPreview} from "./snippets/create_tx";
import {GetMaxValue} from "../util/send";
import {AddUtxoSetter} from "../util/utxos";
import {CreateDirectTransaction} from "./snippets/create_direct_tx";

const Send = ({setModal}) => {
    const payToRef = useRef()
    const messageRef = useRef()
    const coinRef = useRef()
    const amountRef = useRef()
    const [maxValue, maxValueRef, setMaxValue] = useReferredState(0)
    useEffect(() => AddUtxoSetter(async () => {
        const maxValue = await GetMaxValue()
        setMaxValue(Math.max(0, maxValue))
    }), [])
    const onAmountChange = (e) => {
        let {value, min, max} = e.target;
        if (!value) {
            return
        }
        e.target.value = Math.max(Number(min), Math.min(Number(max), Number(value)));
    }
    const onClickMax = async () => {
        amountRef.current.value = maxValueRef.current
    }
    const onClickCoin = async () => {
        setMaxValue(Math.max(0, await GetMaxValue(coinRef.current.value)))
    }
    const formSubmit = async (e) => {
        e.preventDefault()
        if (maxValueRef.current < bitcoin.Fee.DustLimit) {
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
        if (message && message.length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog("Message length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
            return
        }
        if (amount < bitcoin.Fee.DustLimit) {
            window.electron.showMessageDialog("Amount must be above dust limit (546)")
            return
        }
        const wallet = await GetWallet()
        const outputScript = address.toOutputScript(payTo)
        let outputScripts = [{script: outputScript, value: amount}]
        if (message && message.length) {
            const sendOpReturnOutput = script.compile([
                opcodes.OP_RETURN,
                Buffer.from(bitcoin.Prefix.Send, "hex"),
                Buffer.from(bitcoin.GetPkHashFromAddress(payTo), "hex"),
                Buffer.from(message),
            ])
            outputScripts.unshift({script: sendOpReturnOutput, value: 0})
        }
        if (e.type === "submit") {
            await CreateTransactionWithPreview(wallet, outputScripts, "", coinRef.current.value)
        } else if (e.type === "click") {
            await CreateDirectTransaction(wallet, outputScripts, setModal, null, true, "", coinRef.current.value)
        }
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
                <label>
                    <span className={form.span}>Coin Output (defaults to largest):</span>
                    <input className={form.input} ref={coinRef} type="text"/>
                    <input type="button" value={"Set Coin"} onClick={onClickCoin}/>
                </label>
            </p>
            <p>
                <input type="submit" value="Preview"/>
                <button onClick={formSubmit}>Sign and Broadcast</button>
            </p>
        </form>
    )
}

export default Send
