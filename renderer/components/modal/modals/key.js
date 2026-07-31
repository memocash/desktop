import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";
import {useReferredState} from "../../util/state";

const KeyModal = ({onClose, modalProps: {address}}) => {
    const [showKey, showKeyRef, setShowKey] = useReferredState(false)
    const [loading, setLoading] = useState(true)
    const [missing, setMissing] = useState(false)
    const [wif, setWif] = useState("")
    useEffect(() => {(async () => {
        const wallet = await window.electron.getWallet()
        const allAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
        if (!allAddresses.includes(address)) {
            // Say so, rather than asking for a password to unlock a key that no
            // password will produce.
            setMissing(true)
            setLoading(false)
            return
        }
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (!encrypted) {
            await loadKey()
            setShowKey(true)
        }
        setLoading(false)
    })()}, [address])
    const loadKey = async (password) => {
        const {error, value} = await window.electron.exportPrivateKey(address, password)
        if (!error) {
            setWif(value || "Wallet does not have private keys")
            return true
        }
        return false
    }
    const onCorrectPassword = async (password) => {
        if (await loadKey(password)) {
            setShowKey(true)
            return true
        }
        return false
    }
    const body = () => {
        if (loading) {
            return <div className={styles.text}>Loading...</div>
        }
        if (missing) {
            return (
                <div>
                    <div className={styles.text}>Address not found in this wallet.</div>
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
