import {useRouter} from "next/router";
import {useEffect, useState} from "react";
import Head from "next/head";
import form from "../styles/form.module.css";
import styleTx from "../styles/tx.module.css";
import ShortHash from "../components/util/txs";

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
    const clickTx = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
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
                    <div className={styleTx.input_output_head}>Inputs ({txInfo.inputs.length})</div>
                    <div className={styleTx.input_output_box}>
                        <div className={styleTx.input_output_box_grid}>
                            {!txInfo.inputs.length && <p>
                                <span>0437cd...a597c9:0</span>
                                <span>1MCgBDVXTwfEKYtu2PtPHBif5BpthvBrHJ</span>
                                <span>5,000,000,000</span>
                            </p>}
                            {txInfo.inputs.map((input, i) => {
                                return (
                                    <p key={i}>
                                    <span><a onClick={() => clickTx(input.prev_hash)} title={input.prev_hash}>
                                        {ShortHash(input.prev_hash)}</a>:{input.prev_index}</span>
                                        <span>{input.output && input.output.address}</span>
                                        <span className={styleTx.spanRight}>
                                            {input.output && input.output.value.toLocaleString()}</span>
                                    </p>
                                )
                            })}
                        </div>
                    </div>
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Outputs ({txInfo.outputs.length})</div>
                    <div className={styleTx.input_output_box}>
                        <div className={[styleTx.input_output_box_grid, styleTx.input_output_box_grid_output].join(" ")}>
                            {!txInfo.outputs.length && <p>
                                <span>{inputPayTo}</span>
                                <span>{inputAmount}</span>
                            </p>}
                            {txInfo.outputs.map((output, i) => {
                                return (
                                    <p key={i}>
                                        <span>{output.address}</span>
                                        <span className={styleTx.spanRight}>{output.value.toLocaleString()}</span>
                                    </p>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Tx
