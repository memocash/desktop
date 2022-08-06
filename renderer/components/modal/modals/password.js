import styles from "../../../styles/modal.module.css"
import {useRef, useState} from "react";

const Password = ({onClose, onCorrectPassword}) => {
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const passwordInputRef = useRef()
    const handleCheckPassword = async () => {
        const enteredPassword = passwordInputRef.current.value
        const storedPassword = await window.electron.getPassword()
        if (enteredPassword === storedPassword) {
            onCorrectPassword()
        } else {
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
