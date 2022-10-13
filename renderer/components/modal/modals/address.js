import {useEffect, useState} from "react"
import Modal from "../modal"
import ImportKeys from "../../load/import_keys"
import styles from "../../../styles/modal.module.css"
import GetWallet from "../../util/wallet"
import GetAddresses from "../../util/addresses"

const AddressModal = ({onClose, setLastUpdate}) => {
    const [error, setError] = useState("")
    const onSetKeysAndAddresses = async (keys, addresses) => {
        const wallet = await GetWallet()
        if((keys.length > 0) && wallet.keys.length == 0){
            setError("Error, cannot add keys to a keyless wallet")
            return
        } else if((addresses.length > 0) && wallet.keys.length > 0){
            setError("Error, cannot add addresses directly to a wallet with keys")
            return
        } else if(wallet.keys.length > 0){
            const convertedKeys = await GetAddresses("", keys)
            await window.electron.addAddresses(convertedKeys)
            await window.electron.addKeys(keys)
        } else{
            await window.electron.addAddresses(addresses)
        }
        setLastUpdate((new Date()).toISOString())
        onClose()
    }

    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <ImportKeys onSetKeysAndAddresses={onSetKeysAndAddresses} onBack={onClose}/>
                {error.length ? <p>{error}</p> : <p>&nbsp;</p>}
            </div>
        </Modal>
    )
}

export default AddressModal
