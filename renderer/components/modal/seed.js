import {useEffect, useState} from "react"
import Modal from "./modal"
import styles from "./seed.module.css"
import Password from "./password";

const SeedModal = ({onClose}) => {
    const [showSeed, setShowSeed] = useState(false)
    const [seedPhrase, setSeedPhrase] = useState("")
    useEffect(async () => {
        const {seed} = await window.electron.getWallet()
        setSeedPhrase(seed)
        const storedPassword = await window.electron.getPassword()
        if (!storedPassword || !storedPassword.length) {
            setShowSeed(true)
        }
    }, [])
    const onCorrectPassword = () => {
        setShowSeed(true)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                {!showSeed ?
                    <Password onClose={onClose} onCorrectPassword={onCorrectPassword}/>
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
                            <div>m/44'/145'/0'</div>
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
