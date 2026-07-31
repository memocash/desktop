import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";
import {useReferredState} from "../../util/state";
import {WalletErrors} from "../../../../main/common/util"

const KeyModal = ({onClose, modalProps: {address}}) => {
    const [showKey, showKeyRef, setShowKey] = useReferredState(false)
    const [loading, setLoading] = useState(true)
    const [missing, setMissing] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [wif, setWif] = useState("")
    useEffect(() => {(async () => {
        const wallet = await window.electron.getWallet()
        // Main sends all three lists whether or not the wallet has anything in
        // them, so there is nothing to guard against here.
        const allAddresses = wallet.addresses.concat(wallet.changeList, wallet.slpList)
        if (!allAddresses.includes(address)) {
            // Say so, rather than asking for a password to unlock a key that no
            // password will produce.
            setMissing(true)
            setLoading(false)
            return
        }
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (!encrypted) {
            // The encrypted path reports a failed export through the password
            // prompt; with no prompt in the way, it is reported here instead of
            // showing an empty key box.
            const error = await loadKey()
            if (error) {
                setLoadError(error)
            } else {
                setShowKey(true)
            }
        }
        setLoading(false)
    })()}, [address])
    // The error, or undefined once the key is in hand.
    const loadKey = async (password) => {
        const {error, value} = await window.electron.exportPrivateKey(address, password)
        if (error) {
            return error
        }
        setWif(value || "Wallet does not have private keys")
    }
    // false for a wrong password, the message for anything else, so the prompt
    // doesn't report a wallet it cannot read as a password that was mistyped.
    const onCorrectPassword = async (password) => {
        const error = await loadKey(password)
        if (error) {
            return error === WalletErrors.WrongPassword ? false : error
        }
        setShowKey(true)
        return true
    }
    const body = () => {
        if (loading) {
            return <div className={styles.text}>Loading...</div>
        }
        if (missing || loadError) {
            return (
                <div>
                    <div className={styles.text}>{missing ?
                        "Address not found in this wallet." :
                        "Could not export the private key: " + loadError}</div>
                    <div className={styles.buttons}>
                        <button onClick={onClose}>Close</button>
                    </div>
                </div>
            )
        }
        if (!showKeyRef.current) {
            return <Password onClose={onClose} onCorrectPassword={onCorrectPassword} authenticate={false}/>
        }
        return (
            <div>
                <div className={styles.text}>Address: {address}</div>
                <div className={styles.text}>Script type: p2pkh</div>
                <div className={styles.text}>Private Key:</div>
                <textarea className={styles.seedPhrase} value={wif} readOnly/>
                <div className={styles.buttons}>
                    <button onClick={onClose}>Close</button>
                </div>
            </div>
        )
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>{body()}</div>
        </Modal>
    )
}

export default KeyModal
