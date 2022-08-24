import {useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import form from "../../styles/form.module.css"

const CreatePassword = ({onBack, onPasswordCreated}) => {
    const [passwordsDontMatch, setPasswordsDontMatch] = useState(false)
    const password = useRef()
    const confirmPassword = useRef()
    const handleVerifyPassword = () => {
        const firstPassword = password.current.value
        const secondPassword = confirmPassword.current.value
        if (firstPassword === secondPassword) {
            onPasswordCreated(firstPassword)
        } else {
            setPasswordsDontMatch(true)
        }
    }
    const handleEditPassword = () => {
        if (passwordsDontMatch) {
            setPasswordsDontMatch(false)
        }
    }
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Create a Password to encrypt your key</b></div>
                <div className={styles.boxMain}>
                    <p>If you wish to skip encryption, leave password fields blank.</p>
                    <div className={form.grid}>
                        <label htmlFor="password">Password:</label>
                        <input id="password" ref={password} onChange={handleEditPassword} type="password"/>
                        <label htmlFor="password-confirm">Confirm Password:</label>
                        <input id="password-confirm" ref={confirmPassword} onChange={handleEditPassword}
                               type="password"/>
                    </div>
                    {passwordsDontMatch &&
                    <p>Passwords do not match. Try again.</p>
                    }
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={handleVerifyPassword}>Finish</button>
            </div>
        </div>
    )
}

export default CreatePassword
