import {useRouter} from "next/router";
import {useEffect, useRef, useState} from "react";
import form from "../../styles/form.module.css";
import styleTx from "../../styles/tx.module.css";
import ShortHash from "../util/txs";
import GetWallet from "../util/wallet";
import {useReferredState} from "../util/state";
import bitcoin, {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import styles from "../modal/seed.module.css";
import Password from "../modal/password";
import Modal from "../modal/modal";

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
    useEffect(async () => {
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
                const valueInt = parseInt(outputValue)
                let outputAddress
                try {
                    outputAddress = bitcoin.address.fromOutputScript(scriptBuffer)
                } catch (e) {
                    outputAddress = "unknown: nonstandard"
                }
                tx.outputs.push({
                    address: outputAddress,
                    value: valueInt,
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
    }, [router])
    useEffect(async () => {
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
    }, [transactionId])
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
        const wallet = await GetWallet()
        if (!wallet.seed && !(wallet.keys && wallet.keys.length)) {
            window.electron.showMessageDialog("Watch only wallet does not have private key and cannot sign.")
            return
        }
        let getKey
        if (wallet.seed) {
            const seed = mnemonicToSeedSync(wallet.seed)
            const node = fromSeed(seed)
            getKey = (address) => {
                for (let i = 0; i < wallet.addresses.length; i++) {
                    if (address === wallet.addresses[i]) {
                        const child = node.derivePath("m/44'/0'/0'/0/" + i)
                        return ECPair.fromWIF(child.toWIF())
                    }
                }
            }
        } else {
            getKey = (address) => {
                for (let i = 0; i < wallet.keys.length; i++) {
                    const key = ECPair.fromWIF(wallet.keys[i])
                    if (address === key.getAddress()) {
                        return key
                    }
                }
            }
        }
        const tx = bitcoin.Transaction.fromBuffer(txInfoRef.current.raw)
        let txb
        let txBuild
        for (let lockTime = 5e8; lockTime < 5e8+2^12; lockTime++) {
            txb = bitcoin.TransactionBuilder.fromTransaction(tx)
            for (let i = 0; i < txInfoRef.current.inputs.length; i++) {
                const input = txInfoRef.current.inputs[i]
                const key = getKey(input.output.address)
                if (key === undefined) {
                    console.log("Unable to find key for input address: " + input.output.address)
                    return
                }
                txb.sign(i, key, undefined, bitcoin.Transaction.SIGHASH_ALL, input.output.value)
            }
            txBuild = txb.build()
            if (!beatHashRef.current) {
                break
            }
            const txHash = txBuild.getId()
            if (txHash < beatHashRef.current) {
                break
            }
            tx.locktime = lockTime
        }
        const buf = txBuild.toBuffer()
        txInfoRef.current.raw = buf
        const size = buf.length
        setSize(size)
        setTxInfo(txInfoRef.current)
        transactionIdEleRef.current.value = txBuild.getId()
        const feeRate = feeRef.current / size
        setFeeRate(feeRate.toFixed(4))
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
