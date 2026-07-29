import styles from "../../../styles/modal.module.css"
import {useRef, useState} from "react";

const Password = ({onClose, onCorrectPassword, authenticate = true}) => {
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const passwordInputRef = useRef()
    const handleCheckPassword = async () => {
        const enteredPassword = passwordInputRef.current.value
        if (authenticate) {
            const {error} = await window.electron.authenticateWallet(enteredPassword)
            if (error) {
                setHasEnteredWrongPassword(true)
                return
            }
        }
        if (await onCorrectPassword(enteredPassword) === false) {
            setHasEnteredWrongPassword(true)
        }
    }
    const handlePasswordChange = () => {
        if (hasEnteredWrongPassword) {
            setHasEnteredWrongPassword(false)
        }
    }
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
            {hasEnteredWrongPassword ?
                <p>Incorrect password</p> :
                <p>&nbsp;</p>
            }
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
                <button onClick={handleCheckPassword}>OK</button>
            </div>
        </div>
    )
}

export default Password
