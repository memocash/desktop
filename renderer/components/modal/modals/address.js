import {useEffect, useState} from "react"
import Modal from "../modal"
import ImportKeys from "../../load/import_keys"
import styles from "../../../styles/modal.module.css"
import GetWallet from "../../util/wallet"
import GetAddresses from "../../util/addresses"

const AddressModal = ({onClose}) => {
    const onSetKeysAndAddresses = async (keys, addresses) => {
        const convertedKeys = GetAddresses("", keys)
        await window.electron.addAddresses(addresses)
        await window.electron.addAddresses(convertedKeys)
        await window.electron.addKeys(keys)
        onClose()
    }

    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                {
                    <ImportKeys onSetKeysAndAddresses={onSetKeysAndAddresses} onBack={onClose}/>
                }
            </div>
        </Modal>
    )
}

export default AddressModal
