import {useRef, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import form from "../../../styles/form.module.css"
import GetWallet from "../../util/wallet"
import {ParseTokenAmount} from "../../util/slp"
import {CreateSlpGenesisTransaction} from "../../wallet/snippets/create_slp_tx"

const MaxTokenAmount = 2n ** 64n - 1n

const TokenCreateModal = ({onClose, setModal}) => {
    const tickerRef = useRef()
    const nameRef = useRef()
    const decimalsRef = useRef()
    const docUrlRef = useRef()
    const amountRef = useRef()
    const batonRef = useRef()
    const [error, setError] = useState("")
    const formSubmit = async (e) => {
        e.preventDefault()
        const decimalsStr = decimalsRef.current.value.trim() || "0"
        if (!/^[0-9]$/.test(decimalsStr)) {
            setError("Decimals must be between 0 and 9")
            return
        }
        const decimals = parseInt(decimalsStr)
        const createBaton = batonRef.current.checked
        const amount = ParseTokenAmount(amountRef.current.value, decimals)
        if (amount === null || amount > MaxTokenAmount || (amount === 0n && !createBaton)) {
            setError(amount === 0n ? "Initial supply of 0 requires a mint baton to mint later" :
                "Invalid initial supply (max " + decimals + " decimal places)")
            return
        }
        setError("")
        const wallet = await GetWallet()
        const preview = e.type === "submit"
        const created = await CreateSlpGenesisTransaction({
            wallet,
            ticker: tickerRef.current.value.trim(),
            name: nameRef.current.value.trim(),
            docUrl: docUrlRef.current.value.trim(),
            decimals, amount, createBaton, setModal,
            onDone: onClose, preview,
        })
        if (created && preview) {
            onClose()
        }
    }
    return (
        <Modal onClose={onClose}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <div className={styles.header}>
                    <h2>Create Token</h2>
                </div>
                <p>Creates a new SLP token. The initial supply is sent to your wallet;
                    the token id will be this transaction's hash.</p>
                <form onSubmit={formSubmit}>
                    <p>
                        <label>
                            <span className={form.span}>Ticker:</span>
                            <input className={form.input_small} ref={tickerRef} type="text" autoFocus
                                   spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Name:</span>
                            <input className={form.input} ref={nameRef} type="text" spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Decimals (0-9):</span>
                            <input className={form.input_small} ref={decimalsRef} type="text" defaultValue={"0"}
                                   spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Document URL (optional):</span>
                            <input className={form.input} ref={docUrlRef} type="text" spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Initial supply:</span>
                            <input className={form.input_small} ref={amountRef} type="text" spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Create mint baton:</span>
                            <input ref={batonRef} type="checkbox"/>
                            <i> (allows minting more supply later)</i>
                        </label>
                    </p>
                    <p>
                        <input type="submit" value="Preview"/>
                        <button onClick={formSubmit}>Sign and Broadcast</button>
                    </p>
                </form>
                {error.length ? <p>{error}</p> : <p>&nbsp;</p>}
            </div>
        </Modal>
    )
}

export default TokenCreateModal
