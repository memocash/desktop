import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";

const SeedModal = ({onClose}) => {
    const [showSeed, setShowSeed] = useState(false)
    const [seedPhrase, setSeedPhrase] = useState("")
    useEffect(() => {(async () => {
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (!encrypted) {
            const {value} = await window.electron.exportSeed()
            setSeedPhrase(value || "")
            setShowSeed(true)
        }
    })()}, [])
    const onCorrectPassword = async (password) => {
        const {error, value} = await window.electron.exportSeed(password)
        if (!error) {
            setSeedPhrase(value || "")
            setShowSeed(true)
            return true
        }
        return false
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                {!showSeed ?
                    <Password onClose={onClose} onCorrectPassword={onCorrectPassword} authenticate={false}/>
                    :
                    <div>
                        <div className={styles.text}>Your wallet seed phrase is:</div>
                        <textarea className={styles.seedPhrase} value={seedPhrase} readOnly/>
                        <p className={styles.flex}>
                            <div>Seed format:</div>
                            <div><strong>BIP39</strong></div>
                        </p>
                        <p className={styles.flex}>
                            <div>Wallet derivation path:</div>
                            <div>m/44'/0'/0'</div>
                        </p>
                        <p className={styles.message}>
                            Please save these 12 words on paper (order is important). Additionally, save the derivation
                            path as well.
                            This seed will allow you to recover your wallet in case of computer failure.
                        </p>
                        <div><strong>WARNING:</strong></div>
                        <ul>
                            <li>Never disclose your seed.</li>
                            <li>Never type it on a website.</li>
                            <li>Do not store it electronically.</li>
                        </ul>
                        <div className={styles.buttons}>
                            <button onClick={onClose}>Close</button>
                        </div>
                    </div>
                }
            </div>
        </Modal>
    )
}

export default SeedModal
