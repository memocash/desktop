import {useRef, useState} from "react"
import {address, ECPair} from "bitcoinjs-lib"
import styles from "../../styles/addWallet.module.css"

const ImportKeys = ({onSetKeysAndAddresses, onBack}) => {
    const [error, setError] = useState("")
    const privateKeyList = useRef()
    const handleClickNext = () => {
        const list = privateKeyList.current.value.split("\n")
        list = [...new Set(list)]
        let keyList = [], addressList = []
        for (let i = 0; i < list.length; i++) {
            const item = list[i]
            try {
                const address = ECPair.fromWIF(item).getAddress()
                if (!address || !address.length) {
                    setError("ERROR: Invalid addresses or WIF(s) or none entered")
                    return
                }
            } catch (err1) {
                try {
                    address.fromBase58Check(item)
                } catch (err2) {
                    console.log(err1)
                    console.log(err2)
                    setError("ERROR: Invalid addresses or WIF(s) or none entered")
                    return
                }
                addressList.push(item)
                continue
            }
            keyList.push(item)
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
