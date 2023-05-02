import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {useReferredState} from "../../util/state";

const KeyModal = ({onClose, modalProps: {address}}) => {
    const [showKey, showKeyRef, setShowKey] = useReferredState(false)
    const [loading, setLoading] = useState(true)
    const [displayAddress, setDisplayAddress] = useState("Finding address...")
    const [wif, setWif] = useState("")
    useEffect(() => {(async () => {
        const wallet = await window.electron.getWallet()
        const storedPassword = await window.electron.getPassword()
        let changeAddress = false
        if (!storedPassword || !storedPassword.length) {
            setShowKey(true)
            setLoading(false)
        } else {
            setLoading(false)
        }
        let addressId = -1
        for (let i = 0; i < wallet.addresses.length; i++) {
            if (wallet.addresses[i] === address) {
                changeAddress = false
                addressId = i
                break
            }
        }
        for (let i = 0; i < wallet.changeList.length; i++) {
            if (wallet.changeList[i] === address) {
                changeAddress = true
                addressId = i
                break
            }
        }
        if (addressId === -1) {
            setDisplayAddress("Address not found")
            return
        }
        if (wallet.seed) {
            const seed = mnemonicToSeedSync(wallet.seed)
            const node = fromSeed(seed)
            let path = "m/44'/0'/0'/0/" + addressId
            if (!changeAddress) {
                path = "m/44'/0'/0'/0/" + addressId
                setDisplayAddress(wallet.addresses[addressId])
            } else {
                path = "m/44'/0'/0'/1/" + addressId
                setDisplayAddress(wallet.changeList[addressId])
            }
            const child = node.derivePath(path)
            const wif = child.toWIF()

            setWif(wif)
        } else if (wallet.keys) {
            setDisplayAddress(wallet.addresses[addressId])
            setWif(wallet.keys[addressId])
        } else {
            setDisplayAddress(wallet.addresses[0])
            setWif("Wallet does not have private keys")
        }
    })()}, [address])
    const onCorrectPassword = () => {
        setShowKey(true)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                {!loading ? !showKeyRef.current ?
                    <Password onClose={onClose} onCorrectPassword={onCorrectPassword}/>
                    :
                    <div>
                        <div className={styles.text}>Address: {displayAddress}</div>
                        <div className={styles.text}>Script type: p2pkh</div>
                        <div className={styles.text}>Private Key:</div>
                        <textarea className={styles.seedPhrase} value={wif} readOnly/>
                        <div className={styles.buttons}>
                            <button onClick={onClose}>Close</button>
                        </div>
                    </div> : <div className={styles.text}>Loading...</div>}
            </div>
        </Modal>
    )
}

export default KeyModal
