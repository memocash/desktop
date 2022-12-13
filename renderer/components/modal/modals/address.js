import {useEffect, useState} from "react"
import Modal from "../modal"
import ImportKeys from "../../load/import_keys"
import styles from "../../../styles/modal.module.css"
import GetWallet from "../../util/wallet"
import {GetAddresses} from "../../util/addresses"
import {Modals} from "../../../../main/common/util/modals";

const AddressModal = ({onClose, setLastUpdate, setModal}) => {
    const [error, setError] = useState("")
    const [addOrRemove, setAddOrRemove] = useState(true)
    const onSetKeysAndAddresses = async (keys, addresses) => {
        let storedPassword = await window.electron.getPassword()
        if(addOrRemove) {
            if(storedPassword && storedPassword.length > 0) {
                setModal(Modals.Password, {onCorrectPassword: async () => {await add(keys, addresses)}})
            }
            else{
                await add(keys, addresses)
            }
        }
        else{
            if(storedPassword && storedPassword.length > 0){
                setModal(Modals.Password, {onCorrectPassword: async () => {await remove(keys, addresses)}})
            }
            else{
                await remove(keys, addresses)
            }
        }
    }
    const add = async (keys, addresses) => {
        const wallet = await GetWallet()
        if((keys.length > 0) && wallet.keys.length == 0){
            setError("Error, cannot add keys to a keyless wallet")
            return
        } else if((addresses.length > 0) && wallet.keys.length > 0){
            setError("Error, cannot add addresses directly to a wallet with keys")
            return
        } else if(wallet.keys.length > 0){
            const convertedKeys = GetAddresses("", keys)
            await window.electron.addAddresses(convertedKeys)
            await window.electron.addKeys(keys)
        } else{
            await window.electron.addAddresses(addresses)
        }
        setLastUpdate((new Date()).toISOString())
        onClose()
    }
    const remove = async (keys, addresses) => {
        const wallet = await GetWallet()
        if((keys.length > 0) && wallet.keys.length == 0){
            setError("Error, cannot remove keys from a keyless wallet")
            return
        } else if((addresses.length > 0) && wallet.keys.length > 0){
            setError("Error, cannot remove addresses directly from a wallet with keys")
            return
        } else if(wallet.keys.length > 0){
            const convertedKeys = GetAddresses("", keys)
            await window.electron.removeAddresses(convertedKeys)
            await window.electron.removeKeys(keys)
        } else{
            await window.electron.removeAddresses(addresses)
        }
        setLastUpdate((new Date()).toISOString())
        onClose()
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <div className={styles.header}>
                    <h2>Add or Remove Addresses</h2>
                    <div>
                        <input type={"radio"} name={"addOrRemove"} id={"add"} value={"add"} checked={addOrRemove} onChange={() => setAddOrRemove(true)}/>
                        <label htmlFor={"add"}>Add Addresses</label>
                        <input type={"radio"} name={"addOrRemove"} id={"remove"} value={"remove"} checked={!addOrRemove} onChange={() => setAddOrRemove(false)}/>
                        <label htmlFor={"remove"}>Remove Addresses</label>
                    </div>
                </div>
                <ImportKeys onSetKeysAndAddresses={onSetKeysAndAddresses} onBack={onClose}/>
                {error.length ? <p>{error}</p> : <p>&nbsp;</p>}
            </div>
        </Modal>
    )
}

export default AddressModal
