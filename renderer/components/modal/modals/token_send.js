import {useRef, useState} from "react"
import {address} from "@bitcoin-dot-com/bitcoincashjs2-lib"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import form from "../../../styles/form.module.css"
import GetWallet from "../../util/wallet"
import ShortHash from "../../util/txs"
import {FormatTokenAmount, FormatTokenAmountPlain, ParseTokenAmount} from "../../util/slp"
import {CreateSlpTransaction} from "../../wallet/snippets/create_slp_tx"

const TokenSendModal = ({onClose, setModal, modalProps: {token}}) => {
    const payToRef = useRef()
    const amountRef = useRef()
    const [error, setError] = useState("")
    const onClickMax = () => {
        amountRef.current.value = FormatTokenAmountPlain(token.amount, token.decimals)
    }
    const formSubmit = async (e) => {
        e.preventDefault()
        const payTo = payToRef.current.value
        try {
            address.fromBase58Check(payTo)
        } catch (err) {
            setError("Unable to parse address: " + err.toString())
            return
        }
        const amount = ParseTokenAmount(amountRef.current.value, token.decimals)
        if (amount === null || amount <= 0n) {
            setError("Invalid amount" + (token.decimals ?
                " (max " + token.decimals + " decimal places)" : " (token has no decimal places)"))
            return
        }
        setError("")
        const wallet = await GetWallet()
        const preview = e.type === "submit"
        const created = await CreateSlpTransaction({
            wallet, token, payTo, amount, setModal,
            onDone: onClose, preview,
        })
        if (created && preview) {
            onClose()
        }
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <div className={styles.header}>
                    <h2>Send {token.ticker || ShortHash(token.token_hash)}</h2>
                </div>
                <p title={token.token_hash}>
                    {token.name ? token.name + " - " : ""}
                    Balance: {FormatTokenAmount(token.amount, token.decimals)} {token.ticker}
                </p>
                <form onSubmit={formSubmit}>
                    <p>
                        <label>
                            <span className={form.span}>Pay to:</span>
                            <input className={form.input} ref={payToRef} type="text" autoFocus spellCheck="false"/>
                        </label>
                    </p>
                    <p>
                        <label>
                            <span className={form.span}>Amount:</span>
                            <input className={form.input_small} ref={amountRef} type="text" spellCheck="false"/>
                            <input type="button" value={"Max"} onClick={onClickMax}/>
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

export default TokenSendModal
