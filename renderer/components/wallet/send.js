import {useEffect, useState} from "react";
import {address, opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import form from "../../styles/form.module.css"
import bitcoin from "../util/bitcoin";
import GetWallet from "../util/wallet";
import {useReferredState} from "../util/state";
import {CreateTransactionWithPreview} from "./snippets/create_tx";
import {CoinProblem, CoinString, EstimateSend, GetMaxValue, ResolveCoin} from "../util/send";
import {AddUtxoSetter} from "../util/utxos";
import {CreateDirectTransaction} from "./snippets/create_direct_tx";

const PayToScriptSize = 25

// The outputs a send would carry: the payment itself, plus an OP_RETURN
// carrying the optional message. Used both for the fee estimate while typing
// and, once the form validates, for the transaction that gets built. Before a
// valid address is entered the payment script is only sized, not built, so the
// estimate still works mid-typing.
const BuildOutputs = (payTo, message, amount) => {
    let paymentScript
    try {
        paymentScript = address.toOutputScript(payTo)
    } catch (err) {
        paymentScript = Buffer.alloc(PayToScriptSize)
    }
    const outputs = [{script: paymentScript, value: amount}]
    if (message && message.length) {
        let pkHash
        try {
            pkHash = Buffer.from(bitcoin.GetPkHashFromAddress(payTo), "hex")
        } catch (err) {
            pkHash = Buffer.alloc(20)
        }
        outputs.unshift({
            script: script.compile([
                opcodes.OP_RETURN,
                Buffer.from(bitcoin.Prefix.Send, "hex"),
                pkHash,
                Buffer.from(message),
            ]),
            value: 0,
        })
    }
    return outputs
}

const Send = ({setModal}) => {
    const [maxValue, maxValueRef, setMaxValue] = useReferredState(0)
    const [amount, setAmount] = useState("")
    const [message, setMessage] = useState("")
    const [payTo, setPayTo] = useState("")
    // Referred so the utxo listener below, which is registered once, always
    // costs against the coin currently in the field.
    const [coin, coinRef, setCoin] = useReferredState("")
    const [errors, setErrors] = useState({})
    useEffect(() => AddUtxoSetter(async () => {
        setMaxValue(Math.max(0, await GetMaxValue(coinRef.current)))
    }), [])
    // Naming a coin caps the send at that coin's value, so the ceiling the Max
    // button and the amount validation use has to follow the field rather than
    // waiting for a separate confirmation step.
    useEffect(() => {(async () => {
        setMaxValue(Math.max(0, await GetMaxValue(coin)))
    })()}, [coin])
    const amountValue = parseInt(amount)
    const outputs = BuildOutputs(payTo, message, isNaN(amountValue) ? 0 : amountValue)
    // Estimate against the outputs and the coin this form would actually build
    // with, so the fee accounts for an attached message and for which inputs
    // get pulled in.
    const estimate = EstimateSend(outputs, coin)
    const fee = estimate.fee
    const total = isNaN(amountValue) ? null : amountValue + fee
    // A named coin is the transaction's only input, so it can be unspendable or
    // fall short of a payment the wallet as a whole could afford. Say so on the
    // field rather than letting the builder refuse - or worse, build an input
    // less transaction - once the user presses a send button. Held back until
    // an amount is entered so the message does not fire mid-paste.
    const coinError = !isNaN(amountValue) && amountValue > 0 ? CoinProblem(outputs, coin) : null
    const onClickMax = () => {
        setAmount(String(maxValueRef.current))
        setErrors(current => ({...current, amount: null}))
    }
    // Validation is inline next to the field it belongs to, so a typo is
    // visible while filling the form instead of arriving as a modal dialog
    // after pressing send.
    const validate = () => {
        const next = {}
        if (!payTo.trim().length) {
            next.payTo = "Enter an address to pay"
        } else {
            try {
                address.fromBase58Check(payTo.trim())
            } catch (err) {
                next.payTo = "Not a valid address"
            }
        }
        const messageBytes = bitcoin.Utf8ByteLength(message)
        if (messageBytes > bitcoin.Fee.MaxOpReturn) {
            next.message = `Message is ${messageBytes - bitcoin.Fee.MaxOpReturn} bytes over the ` +
                `${bitcoin.Fee.MaxOpReturn} byte limit`
        }
        if (isNaN(amountValue)) {
            next.amount = "Enter an amount"
        } else if (amountValue < bitcoin.Fee.DustLimit) {
            next.amount = `Amount must be at least the dust limit (${bitcoin.Fee.DustLimit} sats)`
        } else if (amountValue > maxValue) {
            next.amount = `More than the ${maxValue.toLocaleString()} sats available after fees`
        }
        // A coin the builders would refuse, or would silently drop leaving a
        // transaction with no inputs, must never reach them.
        const coinProblem = CoinProblem(BuildOutputs(payTo, message, isNaN(amountValue) ? 0 : amountValue), coin)
        if (coinProblem) {
            next.coin = coinProblem
        }
        setErrors(next)
        return Object.keys(next).length === 0
    }
    const formSubmit = async (e) => {
        e.preventDefault()
        if (maxValueRef.current < bitcoin.Fee.DustLimit) {
            setErrors({amount: "Not enough value in the wallet to create a transaction"})
            return
        }
        if (!validate()) {
            return
        }
        const outputScripts = BuildOutputs(payTo.trim(), message, amountValue)
        // validate() has already established the coin resolves; hand the
        // builders the wallet's own record of it rather than the typed text, so
        // an edited or stale value cannot reach transaction construction.
        const {utxo} = ResolveCoin(coin)
        const coinString = utxo ? CoinString(utxo) : ""
        const wallet = await GetWallet()
        if (e.type === "submit") {
            await CreateTransactionWithPreview(wallet, outputScripts, "", coinString)
        } else if (e.type === "click") {
            await CreateDirectTransaction(wallet, outputScripts, setModal, null, "", coinString)
        }
    }
    return (
        <form className={form.form} onSubmit={formSubmit}>
            <h2 className={form.heading}>Send</h2>
            <div className={form.rows}>
                <Row label={"Pay to"} htmlFor={"send-pay-to"} error={errors.payTo}>
                    <input id={"send-pay-to"} className={form.input} type="text" autoFocus spellCheck="false"
                           value={payTo} onChange={(e) => {
                               setPayTo(e.target.value)
                               setErrors(c => ({...c, payTo: null}))
                           }}/>
                </Row>
                <Row label={"Message"} htmlFor={"send-message"} error={errors.message}
                     hint={"Optional, written on chain with the payment"}>
                    <input id={"send-message"} className={form.input} type="text" value={message}
                           onChange={(e) => {
                               setMessage(e.target.value)
                               setErrors(c => ({...c, message: null}))
                           }}/>
                </Row>
                <Row label={"Amount"} htmlFor={"send-amount"} error={errors.amount}
                     hint={`Up to ${maxValue.toLocaleString()} sats after fees`}>
                    <input id={"send-amount"} className={form.input_small} type="number"
                           value={amount} min={0} onChange={(e) => {
                               setAmount(e.target.value)
                               setErrors(c => ({...c, amount: null}))
                           }}/>
                    {} <span className={form.unit}>sats</span>
                    {} <input type="button" value={"Max"} onClick={onClickMax}/>
                </Row>
                <Row label={"Coin output"} htmlFor={"send-coin"} error={errors.coin || coinError}
                     hint={"Optional, defaults to the largest coin"}>
                    <input id={"send-coin"} className={form.input} type="text" spellCheck="false" value={coin}
                           onChange={(e) => {
                               setCoin(e.target.value)
                               setErrors(c => ({...c, coin: null}))
                           }}/>
                </Row>
            </div>
            <dl className={form.summary}>
                <dt>Estimated fee</dt>
                <dd>{estimate.enough ? fee.toLocaleString() + " sats" : "—"}</dd>
                <dt>Total</dt>
                <dd>{estimate.enough && total !== null ? total.toLocaleString() + " sats" : "—"}</dd>
            </dl>
            <p className={form.actions}>
                <input type="submit" value="Preview"/>
                {} <button className={"button_primary"} onClick={formSubmit}>Sign and broadcast</button>
            </p>
        </form>
    )
}

const Row = ({label, htmlFor, hint, error, children}) => (
    <>
        <label className={form.label} htmlFor={htmlFor}>{label}</label>
        <div className={form.field}>
            <div className={form.control}>{children}</div>
            {error ? <div className={form.error}>{error}</div> :
                hint ? <div className={form.hint}>{hint}</div> : null}
        </div>
    </>
)

export default Send
