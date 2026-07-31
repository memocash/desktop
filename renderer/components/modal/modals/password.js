import styles from "../../../styles/modal.module.css"
import {useRef, useState} from "react";
import {WalletErrors} from "../../../../main/common/util"

const IncorrectPassword = "Incorrect password"

const Password = ({onClose, onCorrectPassword, authenticate = true}) => {
    // One message rather than a flag per kind of failure. Two of those with a
    // priority between them let a later failure sit behind an earlier one that
    // nothing had cleared, which is the same wrong answer this modal is meant to
    // stop giving. Every attempt says what happened on that attempt.
    const [errorMessage, setErrorMessage] = useState("")
    const passwordInputRef = useRef()
    const handleCheckPassword = async () => {
        const enteredPassword = passwordInputRef.current.value
        if (authenticate) {
            const {error} = await window.electron.authenticateWallet(enteredPassword)
            // Only a wrong password means the password was wrong. A wallet that
            // has moved, or a file that cannot be read, would otherwise be
            // reported as one and leave the owner retyping a password that was
            // right all along.
            if (error) {
                setErrorMessage(error === WalletErrors.WrongPassword ? IncorrectPassword : error)
                return
            }
        }
        setErrorMessage(await onCorrectPassword(enteredPassword) === false ? IncorrectPassword : "")
    }
    const handlePasswordChange = () => setErrorMessage("")
    const handlePasswordKeyDown = async (e) => {
        if (e.keyCode === 13) {
            await handleCheckPassword()
        }
    }
    return (
        <div>
            <div className={styles.text}>Enter your password</div>
            <div>
                <label>Password:
                    <input autoFocus ref={passwordInputRef} onChange={handlePasswordChange}
                           onKeyDown={handlePasswordKeyDown} type="password"/>
                </label>
            </div>
            {/* Always a paragraph with something in it, so the buttons stay
                put when a message appears. A plain space would collapse. */}
            <p>{errorMessage || "\u00a0"}</p>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
                <button onClick={handleCheckPassword}>OK</button>
            </div>
        </div>
    )
}

export default Password
