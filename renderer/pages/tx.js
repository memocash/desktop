import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import Head from "next/head";
import form from "../styles/form.module.css";
import styleTx from "../styles/tx.module.css";

const Tx = () => {
    const router = useRouter()
    const [transactionId, setTransactionId] = useState("")
    const [status, setStatus] = useState("Unconfirmed")
    const [date, setDate] = useState("2009-01-11 19:30")
    const [inputPayTo, setInputPayTo] = useState()
    const [inputMessage, setInputMessage] = useState()
    const [inputAmount, setInputAmount] = useState()
    const [txInfo, setTxInfo] = useState({inputs: [], outputs: []})

    useEffect(() => {
        if (!router || !router.query) {
            return
        }
        const {txHash, payTo, message, amount} = router.query
        if (txHash && txHash.length) {
            setTransactionId(txHash)
        } else if (payTo && amount) {
            setInputPayTo(payTo)
            setInputMessage(message)
            setInputAmount(amount)
        }
    }, [router])
    useEffect(async () => {
        if (!transactionId.length) {
            return
        }
        const tx = await window.electron.getTransaction(transactionId)
        setTxInfo(tx)
        let date
        if (tx.seen) {
            date = tx.seen.timestamp
        }
        if (tx.block) {
            setStatus(tx.block.confirmations + " confirmations (Height: " + tx.block.height + ")")
            if (!date || tx.block.timestamp < date) {
                date = tx.block.timestamp
            }
        }
        setDate(date)
    }, [transactionId])
    return (
        <div>
            <Head>
                <title>Transaction</title>
            </Head>
            <div>
                <div className={styleTx.header}>
                    <label>Transaction ID:</label><br/>
                    <input type="text" value={transactionId} className={form.input_wide} spellCheck="false" readOnly/>
                    <br/>
                    Status: {status}<br/>
                    Date: {date}<br/>
                    {inputMessage ? <>Message: {inputMessage}<br/></> : null}
                    Amount: {inputAmount} satoshis<br/>
                    Amount received: 5,000,000,000 satoshis<br/>
                    Size: 275 bytes<br/>
                    Fee: 0 satoshis (0 sat/byte)
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Inputs (1)</div>
                    <div className={styleTx.input_output_box}>
                        {!txInfo.inputs.length && <p>
                            0437cd7f8525ceed2324359c2d0ba26006d92d856a9c20fa0241106ee5a597c9:0
                            &nbsp;&nbsp;&nbsp;&nbsp;
                            5,000,000,000
                        </p>}
                        {txInfo.inputs.map((input, i) => {
                            return (
                                <p key={i}>
                                    {input.prev_hash}:{input.prev_index}
                                    &nbsp;&nbsp;&nbsp;&nbsp;
                                    {input.output &&
                                    <>
                                    {input.output.address} - {input.output.value}
                                    </>
                                    }
                                </p>
                            )
                        })}
                    </div>
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Outputs (2)</div>
                    <div className={styleTx.input_output_box}>
                        {!txInfo.outputs.length && <p>
                            {inputPayTo}
                            &nbsp;&nbsp;&nbsp;&nbsp;
                            {inputAmount}
                        </p>}
                        {txInfo.outputs.map((output, i) => {
                            return (
                                <p key={i}>
                                    {output.address}
                                    &nbsp;&nbsp;&nbsp;&nbsp;
                                    {output.value}
                                </p>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Tx
