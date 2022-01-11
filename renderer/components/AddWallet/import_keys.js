import {useRef, useState} from "react"
import {ECPair} from '@bitcoin-dot-com/bitcoincashjs2-lib'


const ImportKeys = ({onSetKeys, onBack}) => {
    const [showError, setShowError] = useState(false)
    const privateKeyList = useRef()

    const handleClickNext = () => {
        const keyList = privateKeyList.current.value.split("\n")
        for (let i = 0; i < keyList.length; i++) {
            const wif = keyList[i]
            try {
                const address = ECPair.fromWIF(wif).getAddress()
                if (!address || !address.length) {
                    setShowError(true)
                    return
                }
            } catch (err) {
                console.log(err)
                setShowError(true)
                return
            }
        }
        onSetKeys(keyList)
    }

    return (
        <div>
            <h2>Import Bitcoin Keys</h2>
            <div>
                <div>Enter a list of Bitcoin private keys.</div>
                <textarea onChange={() => setShowError(false)} ref={privateKeyList}/>
                {showError ? <p>ERROR: Invalid WIF(s) or no WIFs entered</p> : null}
                <p>
                    <button onClick={handleClickNext}>Next</button>
                </p>
                <p>
                    <button onClick={onBack}>Back</button>
                </p>
            </div>
        </div>
    )
}

export default ImportKeys
