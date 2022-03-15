import {useRef, useState} from "react"
import Modal from "./index"
import styles from "./displaySeed.module.css"

const DisplaySeedModal = ({
    onClose
}) => {
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const [showSeed, setShowSeed] = useState(false)
    const [seedPhrase, setSeedPhrase] = useState("")
    const passwordInputRef = useRef()

    const handleCheckPassword = async () => {
        const enteredPassword = passwordInputRef.current.value
        const storedPassword = await electron.getPassword()
        if(enteredPassword === storedPassword) {
            const { seed } = await electron.getWallet()
            setSeedPhrase(seed)
            setShowSeed(true)
        } else {
            setHasEnteredWrongPassword(true)
        }
    }

    const handlePasswordChange = () => {
        if(hasEnteredWrongPassword) {
            setHasEnteredWrongPassword(false)
        }
    }

    const handlePasswordKeyDown = (e) => {
        if(e.keyCode === 13) {
            handleCheckPassword()
        }
    }

    return (
        <Modal
            onClose={onClose}
        >
            <div className={styles.root}>
                {!showSeed &&
                    <div>
                        <div className={styles.text}>Enter your password</div>
                        <div>
                            <label>Password:
                                <input autoFocus ref={passwordInputRef} onChange={handlePasswordChange}
                                   onKeyDown={handlePasswordKeyDown} type="password"/>
                            </label>
                        </div>
                        {hasEnteredWrongPassword ?
                            <p>Incorrect password</p> :
                            <p>&nbsp;</p>
                        }
                        <div className={styles.buttons}>
                            <button onClick={onClose}>Cancel</button>
                            <button onClick={handleCheckPassword}>OK</button>
                        </div>
                    </div>
                }
                {showSeed &&
                    <div>
                        <div className={styles.text}>Your wallet seed phrase is:</div>
                        <textarea className={styles.seedPhrase} value={seedPhrase} readOnly />
                        <p className={styles.flex}>
                            <div>Seed format:</div>
                            <div><strong>BIP39</strong></div>
                        </p>
                        <p className={styles.flex}>
                            <div>Wallet derivation path:</div>
                            <div>m/44'/145'/0'</div>
                        </p>
                        <p className={styles.message}>
                            Please save these 12 words on paper (order is important). Additionally, save the derivation path as well.
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

export default DisplaySeedModal
