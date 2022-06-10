import {useRouter} from "next/router";
import {useEffect, useRef, useState} from "react";
import Head from "next/head";
import form from "../styles/form.module.css";
import styleTx from "../styles/tx.module.css";
import ShortHash from "../components/util/txs";
import GetWallet from "../components/util/wallet";
import {useReferredState} from "../components/util/state";

const Tx = () => {
    const router = useRouter()
    const [transactionId, transactionIdRef, setTransactionId] = useReferredState("")
    const [status, setStatus] = useState("Unconfirmed")
    const [date, setDate] = useState("2009-01-11 19:30")
    const [inputAmount, setInputAmount] = useState()
    const [txInfo, txInfoRef, setTxInfo] = useReferredState({inputs: [], outputs: []})
    const [size, setSize] = useState(0)
    const [fee, setFee] = useState(0)
    const [feeRate, setFeeRate] = useState(0)
    const transactionIdEleRef = useRef()
    useEffect(async () => {
        if (!router || !router.query) {
            return
        }
        const {txHash, payTo, amount, inputs, changeAddress, change} = router.query
        if (txHash && txHash.length) {
            setTransactionId(txHash)
            transactionIdEleRef.current.value = txHash
        } else if (payTo && amount) {
            setInputAmount(amount)
            const inputStrings = inputs.split(",")
            let tx = {
                inputs: [],
                outputs: [{
                    address: payTo,
                    value: parseInt(amount),
                }],
            }
            const changeInt = parseInt(change)
            if (changeInt !== 0) {
                tx.outputs.push({
                    address: changeAddress,
                    value: changeInt,
                })
            }
            const wallet = await GetWallet()
            const isHighlight = (address) => {
                for (let i = 0; i < wallet.addresses.length; i++) {
                    if (address === wallet.addresses[i]) {
                        return true
                    }
                }
                return false
            }
            for (let i = 0; i < inputStrings.length; i++) {
                const inputValues = inputStrings[i].split(":")
                tx.inputs.push({
                    prev_hash: inputValues[0],
                    prev_index: parseInt(inputValues[1]),
                    highlight: isHighlight(inputValues[3]),
                    output: {
                        value: parseInt(inputValues[2]),
                        address: inputValues[3],
                    },
                })
            }
            setTxInfo(tx)
        }
    }, [router])
    useEffect(async () => {
        if (!transactionId.length) {
            return
        }
        const tx = await window.electron.getTransaction(transactionId)
        const wallet = await GetWallet()
        let amount = 0
        let fee = 0
        let missingInputs = false
        for (let i = 0; i < tx.inputs.length; i++) {
            if (!tx.inputs[i].output) {
                missingInputs = true
                continue
            }
            if (wallet.addresses.indexOf(tx.inputs[i].output.address) > -1) {
                amount -= tx.inputs[i].output.value
                tx.inputs[i].highlight = true
            }
            fee += tx.inputs[i].output.value
        }
        for (let i = 0; i < tx.outputs.length; i++) {
            if (wallet.addresses.indexOf(tx.outputs[i].address) > -1) {
                amount += tx.outputs[i].value
                tx.outputs[i].highlight = true
            }
            fee -= tx.outputs[i].value
        }
        setTxInfo(tx)
        setInputAmount(amount)
        setSize(tx.raw.length)
        if (!missingInputs) {
            setFee(fee)
            const feeRate = fee / tx.raw.length
            setFeeRate(feeRate.toFixed(4))
        } else {
            setFee(0)
            setFeeRate(0)
        }
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
    const clickCopyRaw = () => {
        navigator.clipboard.writeText(Buffer(txInfoRef.current.raw).toString("hex"))
    }
    const clickClose = () => {
        window.electron.closeWindow()
    }
    const transactionIdChange = () => {
        console.log(transactionIdEleRef.current.value)
        if (transactionIdRef.current.length > 0 && transactionIdEleRef.current.value.length === 64 &&
            transactionIdRef.current !== transactionIdEleRef.current.value) {
            setTransactionId(transactionIdEleRef.current.value)
        }
    }
    return (
        <div>
            <Head>
                <title>Transaction</title>
            </Head>
            <div>
                <div className={styleTx.header}>
                    <p>
                        <label>Transaction ID:</label><br/>
                        <input type="text" className={form.input_wide} spellCheck="false"
                               onChange={transactionIdChange} ref={transactionIdEleRef}/>
                    </p>
                    <p>Status: {status}</p>
                    <p>Date: {date}</p>
                    {inputAmount > 0 &&
                    <p>Amount received: {inputAmount.toLocaleString()} satoshis</p>
                    }
                    {inputAmount < 0 &&
                    <p>Amount spent: {(-inputAmount).toLocaleString()} satoshis</p>
                    }
                    <p>Size: {size.toLocaleString()} bytes</p>
                    <p>Fee: {fee} satoshis ({feeRate} sat/byte)</p>
                </div>
                <div>
                    <div className={styleTx.input_output_head}>Inputs ({txInfo.inputs.length})</div>
                    <div className={styleTx.input_output_box}>
                        <div className={styleTx.input_output_grid}>
                            {!txInfo.inputs.length && <p>
                                <span>0437cd...a597c9:0</span>
                                <span>1MCgBDVXTwfEKYtu2PtPHBif5BpthvBrHJ</span>
                                <span>5,000,000,000</span>
                            </p>}
                            {txInfo.inputs.map((input, i) => {
                                return (
                                    <p key={i} className={input.highlight && styleTx.input_output_highlight}>
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
                        <div className={[styleTx.input_output_grid, styleTx.input_output_grid_output].join(" ")}>
                            {txInfo.outputs.map((output, i) => {
                                return (
                                    <p key={i} className={output.highlight && styleTx.input_output_highlight}>
                                        <span>{output.address}</span>
                                        <span className={styleTx.spanRight}>{output.value.toLocaleString()}</span>
                                    </p>
                                )
                            })}
                        </div>
                    </div>
                </div>
                <div className={styleTx.footer}>
                    <span><button onClick={clickCopyRaw}>Copy</button></span>
                    <span className={styleTx.footerRight}>
                        <button onClick={clickClose}>Close</button></span>
                </div>
            </div>
        </div>
    )
}

export default Tx
