import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";

const KeyModal = ({onClose, modalProps: {address}}) => {
    const [showKey, setShowKey] = useState(false)
    const [displayAddress, setDisplayAddress] = useState("")
    const [wif, setWif] = useState("")
    useEffect(async () => {
        const wallet = await window.electron.getWallet()
        if (wallet.seed) {
            let addressId = 0
            for (let i = 0; i < wallet.addresses.length; i++) {
                if (wallet.addresses[i] === address) {
                    addressId = i
                    break
                }
            }
            const seed = mnemonicToSeedSync(wallet.seed)
            const node = fromSeed(seed)
            const child = node.derivePath("m/44'/0'/0'/0/" + addressId)
            const wif = child.toWIF()
            setDisplayAddress(ECPair.fromWIF(wif).getAddress())
            setWif(wif)
        } else {
            setDisplayAddress(wallet.addresses[0])
            setWif(wallet.keys[0])
        }
        const storedPassword = await window.electron.getPassword()
        if (!storedPassword || !storedPassword.length) {
            setShowKey(true)
        }
    }, [address])
    const onCorrectPassword = () => {
        setShowKey(true)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                {!showKey ?
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
                    </div>
                }
            </div>
        </Modal>
    )
}

export default KeyModal
