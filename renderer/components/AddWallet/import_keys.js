import {useRef, useState} from "react"
import {ECPair} from '@bitcoin-dot-com/bitcoincashjs2-lib'
import styles from "../../styles/addWallet.module.css"


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
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Import Bitcoin Keys</b></div>
                <div className={styles.boxMain}>
                    <div>Enter a list of Bitcoin private keys.</div>
                    <textarea onChange={() => setShowError(false)} ref={privateKeyList}/>
                    {showError ? <p>ERROR: Invalid WIF(s) or no WIFs entered</p> : null}
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={handleClickNext}>Next</button>
            </div>
        </div>
    )
}

export default ImportKeys
