import {useRef, useState} from "react"

const CreatePassword = ({onPasswordCreated}) => {
    const [passwordsDontMatch, setPasswordsDontMatch] = useState(false)
    const password = useRef()
    const confirmPassword = useRef()

    const handleVerifyPassword = () => {
        const firstPassword = password.current.value
        const secondPassword = confirmPassword.current.value
        if (firstPassword === secondPassword) {
            // success. Proceed and store password for encryption
            console.log("wallet created")
            onPasswordCreated(firstPassword)
        } else {
            setPasswordsDontMatch(true)
        }
    }

    return (
        <div>
            <h2>Create a Password to encrypt your key</h2>
            <div>
                <label>Password:
                    <input ref={password} type="password"/>
                </label>
                <label>Confirm Password:
                    <input ref={confirmPassword} type="password"/>
                </label>
            </div>
            <button onClick={handleVerifyPassword}>Next</button>
            {passwordsDontMatch &&
            <div>Passwords do not match. Try again.</div>
            }
        </div>
    )
}

export default CreatePassword
