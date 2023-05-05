import {useRouter} from "next/router";
import {useEffect, useRef, useState} from "react";
import form from "../../styles/form.module.css";
import styleTx from "../../styles/tx.module.css";
import ShortHash from "../util/txs";
import GetWallet from "../util/wallet";
import {useReferredState} from "../util/state";
import bitcoin from "@bitcoin-dot-com/bitcoincashjs2-lib";
import styles from "../../styles/modal.module.css"
import Password from "../modal/modals/password";
import Modal from "../modal/modal";
import {setTx} from "./direct_tx";

const Info = () => {
    const router = useRouter()
    const [transactionId, transactionIdRef, setTransactionId] = useReferredState("")
    const [status, setStatus] = useState("Unconfirmed")
    const [date, setDate] = useState("-")
    const [signed, signedRef, setSigned] = useReferredState(false)
    const [inputAmount, setInputAmount] = useState()
    const [txInfo, txInfoRef, setTxInfo] = useReferredState({inputs: [], outputs: []})
    const [size, setSize] = useState(0)
    const [fee, feeRef, setFee] = useReferredState(0)
    const [feeRate, setFeeRate] = useState(0)
    const transactionIdEleRef = useRef()
    const [showPasswordForSign, setShowPasswordForSign] = useState(false)
    const [_, beatHashRef, setBeatHash] = useReferredState("")
    //take this prefix table and re-write it with keys and values swapped
    const Prefix = {
        "6d01": "SetName",
        "6d02": "PostMemo",
        "6d03": "ReplyMemo",
        "6d04": "LikeMemo",
        "6d05": "SetProfile",
        "6d06": "Follow",
        "6d07": "Unfollow",
        "6d0a": "SetPic",
        "6d0c": "ChatPost",
        "6d0d": "ChatFollow",
        "6d0e": "ChatUnfollow",
    }

    const GetOutputScriptInfo = (script) => {
        const scriptBuffer = Buffer.from(script, "hex")
        try {
            const outputAddress = bitcoin.address.fromOutputScript(scriptBuffer)
            return outputAddress
        } catch (e) {
            //ignore
        }
        script = scriptBuffer.toString("hex")
        let info = ""
        if (script.substr(0, 4) === "6a02") {
            switch (script.substr(4, 4)) {
                case "6d01":
                    return "Memo name: " + Buffer.from(script.substr(10), "hex")
                case "6d02":
                    return "Memo post: " + Buffer.from(script.substr(10), "hex")
                case "6d03":
                    const replyTxHash = script.substr(10, 64).match(/.{2}/g).reverse().join("")
                    return (<>Memo reply (<Link
                        href={"/tx/" + replyTxHash}><a>{ShortTxHash(replyTxHash)}</a></Link>): {
                        "" + Buffer.from(script.substr(76), "hex")}</>)
                case "6d04":
                    if (script.length < 12) {
                        info = "Bad memo like"
                        break
                    }
                    const likeTxHash = script.substr(10).match(/.{2}/g).reverse().join("")
                    return (<>Memo like: <Link
                        href={"/tx/" + likeTxHash}><a>{ShortTxHash(likeTxHash)}</a></Link></>)
                case "6d0a":
                    const picUrl = "" + Buffer.from(script.substr(10), "hex")
                    return (<>Memo profile pic: <Link href={picUrl}><a>{picUrl}</a></Link></>)
                case "6d0c":
                    let size = parseInt(script.substr(8, 2), 16)
                    size *= 2
                    if (size + 10 > script.length) {
                        info = "Bad topic message"
                        break
                    }
                    return "Memo topic message (" + Buffer.from(script.substr(10, size), "hex") + "): " +
                        Buffer.from(script.substr(10 + size), "hex")
                case "6d0d":
                    return "Memo topic follow: " + Buffer.from(script.substr(8), "hex")
                case "6d24":
                    return "Memo direct message: " + Buffer.from(script.substr(52), "hex")
                case "6d05":
                    return "Memo profile text: " + Buffer.from(script.substr(10), "hex")
            }
        }
        return "Unknown" + (info.length ? ": " + info : "")
    }

    useEffect(() => {(async () => {
        if (!router || !router.query) {
            return
        }
        const {txHash, inputs, outputs, beatHash} = router.query
        if (txHash && txHash.length) {
            setSigned(true)
            setTransactionId(txHash)
            transactionIdEleRef.current.value = txHash
        } else if (inputs && inputs.length && outputs && outputs.length) {
            const inputStrings = inputs.split(",")
            const outputStrings = outputs.split(",")
            let tx = {
                inputs: [],
                outputs: [],
            }
            let txb = new bitcoin.TransactionBuilder()
            const wallet = await GetWallet()
            const isHighlight = (address) => {
                for (let i = 0; i < wallet.addresses.length; i++) {
                    if (address === wallet.addresses[i]) {
                        return true
                    }
                }
                return false
            }
            let fee = 0
            for (let i = 0; i < inputStrings.length; i++) {
                const [inputPrevHash, inputPrevIndex, inputValue, inputAddress] = inputStrings[i].split(":")
                const valueInt = parseInt(inputValue)
                const prevIndex = parseInt(inputPrevIndex)
                tx.inputs.push({
                    prev_hash: inputPrevHash,
                    prev_index: prevIndex,
                    highlight: isHighlight(inputAddress),
                    output: {
                        value: valueInt,
                        address: inputAddress,
                    },
                })
                fee += valueInt
                const outputScript = bitcoin.address.toOutputScript(inputAddress)
                txb.addInput(Buffer.from(inputPrevHash, 'hex').reverse(), prevIndex,
                    bitcoin.Transaction.DEFAULT_SEQUENCE, outputScript)
            }
            for (let i = 0; i < outputStrings.length; i++) {
                const [outputScript, outputValue] = outputStrings[i].split(":")
                const scriptBuffer = Buffer.from(outputScript, "hex")
                const outputAddress = GetOutputScriptInfo(outputScript)
                const valueInt = parseInt(outputValue)
                tx.outputs.push({
                    address: outputAddress,
                    value: valueInt,
                    script: outputScript,
                    highlight: isHighlight(outputAddress),
                })
                txb.addOutput(scriptBuffer, valueInt)
                fee -= valueInt
            }
            const txBuild = txb.__build(true)
            const buf = txBuild.toBuffer()
            tx.raw = buf
            setSize(buf.length)
            setTxInfo(tx)
            setFee(fee)
            transactionIdEleRef.current.value = txBuild.getId()
            setBeatHash(beatHash)
        }
    })()}, [router])
    useEffect(() => {(async () => {
        if (!transactionId.length || !signedRef.current) {
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
        setSigned(true)
    })()}, [transactionId])
    const clickTx = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const clickCopyRaw = () => {
        navigator.clipboard.writeText(Buffer(txInfoRef.current.raw).toString("hex"))
    }
    const clickSign = async () => {
        const storedPassword = await window.electron.getPassword()
        if (!storedPassword || !storedPassword.length) {
            await onCorrectPassword()
        } else {
            setShowPasswordForSign(true)
        }
    }
    const onClose = () => {
        setShowPasswordForSign(false)
    }
    const onCorrectPassword = async () => {
        setShowPasswordForSign(false)
        const feeRate = feeRef.current / size
        let outer_transaction = {
            outer_size: size,
            outer_txInfo: txInfoRef.current,
            outer_fee: fee,
            outer_transactionIDEleRef: transactionIdEleRef.current,
            outer_beatHash: beatHashRef,
            outer_feeRate: feeRate
        }

        await setTx(outer_transaction, null)
        console.log(outer_transaction)
        txInfoRef.current = outer_transaction.outer_txInfo
        setSize(outer_transaction.outer_size)
        setTxInfo(txInfoRef.current)
        transactionIdEleRef.current.value = outer_transaction.outer_transactionIDEleRef.value
        setFeeRate(feeRate)
        setSigned(true)
    }
    const clickBroadcast = async () => {
        const query = `
    mutation ($raw: String!) {
        broadcast(raw: $raw)
    }
    `
        await window.electron.graphQL(query, {raw: txInfoRef.current.raw.toString("hex")})
        console.log("Broadcast successful")
    }
    const clickClose = () => {
        window.electron.closeWindow()
    }
    const transactionIdChange = () => {
        if (transactionIdRef.current.length > 0 && transactionIdEleRef.current.value.length === 64 &&
            transactionIdRef.current !== transactionIdEleRef.current.value) {
            setTransactionId(transactionIdEleRef.current.value)
        }
    }
    return (
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
                <p>Size: {size.toLocaleString()} bytes ({signed ? "Signed" : "Unsigned"})</p>
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
                                <p key={i} className={input.highlight ? styleTx.input_output_highlight : null}>
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
                                <p key={i} className={output.highlight ? styleTx.input_output_highlight : null}>
                                    <span>{GetOutputScriptInfo(output.script)}</span>
                                    <span className={styleTx.spanRight}>{output.value.toLocaleString()}</span>
                                </p>
                            )
                        })}
                    </div>
                </div>
            </div>
            <div className={styleTx.footer}>
                <span><button onClick={clickCopyRaw}>Copy</button></span>
                &nbsp;
                {!signed && <span><button onClick={clickSign}>Sign</button></span>}
                {signed && <span><button onClick={clickBroadcast}>Broadcast</button></span>}
                <span className={styleTx.footerRight}>
                        <button onClick={clickClose}>Close</button></span>
            </div>
            {showPasswordForSign && <Modal onClose={onClose}>
                <div className={styles.root}>
                    <Password onClose={onClose} onCorrectPassword={onCorrectPassword}/>
                </div>
            </Modal>}
        </div>
    )
}

export default Info
