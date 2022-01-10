import {useRef, useState} from "react"

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

    return (
        <div>
            <h2>Create a Password to encrypt your key</h2>
            <p>If you wish to skip encryption, leave password fields blank.</p>
            <div>
                <label>Password:
                    <input ref={password} type="password"/>
                </label>
                <label>Confirm Password:
                    <input ref={confirmPassword} type="password"/>
                </label>
            </div>
            <button onClick={handleVerifyPassword}>Finish</button>
            {passwordsDontMatch &&
            <div>Passwords do not match. Try again.</div>
            }
            <p>
                <button onClick={onBack}>Back</button>
            </p>
        </div>
    )
}

export default CreatePassword
