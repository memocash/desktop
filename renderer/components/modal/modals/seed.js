import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";
import {WalletErrors} from "../../../../main/common/util"

const SeedModal = ({onClose}) => {
    const [showSeed, setShowSeed] = useState(false)
    const [seedPhrase, setSeedPhrase] = useState("")
    const [loadError, setLoadError] = useState("")
    useEffect(() => {(async () => {
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (!encrypted) {
            // Main asks the person in its own dialog before the seed crosses.
            const {error, value} = await window.electron.exportSeed()
            if (error === WalletErrors.ExportCancelled) {
                // A no in that dialog is an answer, not an error to display.
                onClose()
                return
            }
            if (error) {
                // Anything else is a wallet that could not be read; the
                // encrypted path reports that through the password prompt,
                // and with no prompt in the way it is shown here rather than
                // dressed up as a cancellation.
                setLoadError(error)
                return
            }
            setSeedPhrase(value || "")
            setShowSeed(true)
        }
    })()}, [])
    // false for a wrong password, the message for anything else, so the prompt
    // doesn't report a wallet it cannot read as a password that was mistyped.
    const onCorrectPassword = async (password) => {
        const {error, value} = await window.electron.exportSeed(password)
        if (error) {
            return error === WalletErrors.WrongPassword ? false : error
        }
        setSeedPhrase(value || "")
        setShowSeed(true)
        return true
    }
    if (loadError) {
        return (
            <Modal onClose={onClose}>
                <div className={styles.root}>
                    <div className={styles.text}>{"Could not export the seed: " + loadError}</div>
                    <div className={styles.buttons}>
                        <button onClick={onClose}>Close</button>
                    </div>
                </div>
            </Modal>
        )
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
