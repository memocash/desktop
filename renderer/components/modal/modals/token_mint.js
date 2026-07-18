import {useRef, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import form from "../../../styles/form.module.css"
import GetWallet from "../../util/wallet"
import ShortHash from "../../util/txs"
import {FormatTokenAmount, ParseTokenAmount} from "../../util/slp"
import {CreateSlpMintTransaction} from "../../wallet/snippets/create_slp_tx"

const MaxTokenAmount = 2n ** 64n - 1n

const TokenMintModal = ({onClose, setModal, modalProps: {token}}) => {
    const amountRef = useRef()
    const keepBatonRef = useRef()
    const [error, setError] = useState("")
    const formSubmit = async (e) => {
        e.preventDefault()
        const amount = ParseTokenAmount(amountRef.current.value, token.decimals)
        if (amount === null || amount <= 0n || amount > MaxTokenAmount) {
            setError("Invalid amount" + (token.decimals ?
                " (max " + token.decimals + " decimal places)" : " (token has no decimal places)"))
            return
        }
        setError("")
        const wallet = await GetWallet()
        const preview = e.type === "submit"
        const created = await CreateSlpMintTransaction({
            wallet, token, amount,
            keepBaton: keepBatonRef.current.checked,
            setModal, onDone: onClose, preview,
        })
        if (created && preview) {
            onClose()
        }
    }
    return (
        <Modal onClose={onClose}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <div className={styles.header}>
                    <h2>Mint {token.ticker || ShortHash(token.token_hash)}</h2>
                </div>
                <p title={token.token_hash}>
                    {token.name ? token.name + " - " : ""}
                    Balance: {FormatTokenAmount(token.amount || 0, token.decimals)} {token.ticker}
                </p>
                <p>Mints new supply to your wallet using the mint baton.</p>
                <form onSubmit={formSubmit}>
                    <p>
                        <label>
                            <span className={form.span}>Amount to mint:</span>
                            <input className={form.input_small} ref={amountRef} type="text" autoFocus
                                   spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Keep mint baton:</span>
                            <input ref={keepBatonRef} type="checkbox" defaultChecked={true}/>
                            <i> (uncheck to permanently end minting)</i>
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

export default TokenMintModal
