import {useRef, useState} from "react"
import {address, IsValidWif} from "../util/bitcoincash"
import styles from "../../styles/addWallet.module.css"

const ImportKeys = ({onSetKeysAndAddresses, onBack}) => {
    const [error, setError] = useState("")
    const privateKeyList = useRef()
    const handleClickNext = () => {
        let list = privateKeyList.current.value.split("\n")
        list = [...new Set(list)]
        let keyList = [], addressList = []
        for (let i = 0; i < list.length; i++) {
            const item = list[i]
            // The structure check is all this screen needs: the address a key
            // controls is derived in main, which re-validates every key it is
            // handed either way.
            if (IsValidWif(item)) {
                keyList.push(item)
                continue
            }
            try {
                address.fromBase58Check(item)
            } catch (err) {
                console.log(err)
                setError("ERROR: Invalid addresses or WIF(s) or none entered")
                return
            }
            addressList.push(item)
        }
        if (keyList.length > 0 && addressList.length > 0) {
            setError("ERROR: Cannot only have addresses or WIFs, not both")
            return
        }
        onSetKeysAndAddresses(keyList, addressList)
    }
    return (
        <div className={`${styles.root} ${styles.importKeys}`}>
            <div className={styles.box}>
                <div><b>Import Bitcoin Keys</b></div>
                <div className={styles.boxMain}>
                    <p>Enter a list of Bitcoin addresses (this will create a watch-only wallet) or private keys.</p>
                    <textarea className={styles.bitcoinKeys} onChange={() => setError("")} ref={privateKeyList}/>
                    {error.length ? <p>{error}</p> : <p>&nbsp;</p>}
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
