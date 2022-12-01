import {useEffect, useState} from "react"
import Modal from "../modal"
import ImportKeys from "../../load/import_keys"
import styles from "../../../styles/modal.module.css"
import GetWallet from "../../util/wallet"
import GetAddresses from "../../util/addresses"
import {Modals} from "../../../../main/common/util/modals";
import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";

const RemoveModal = ({basic: {onClose, setLastUpdate, setModal}, modalProps:{address}}) => {
    const onSubmit = async (address) => {
        let storedPassword = await window.electron.getPassword()
        if (storedPassword && storedPassword.length > 0) {
            setModal(Modals.Password, {
                onCorrectPassword: async () => {
                    await remove(address)
                }
            })
        } else {
            await remove(address)
        }
    }
    const remove = async (addresses) => {
        const wallet = await GetWallet()
        let key
        if(wallet.keys.length > 0){
            for (let i = 0; i < wallet.keys.length; i++) {
                const current_key = ECPair.fromWIF(wallet.keys[i])
                if (address === current_key.getAddress()) {
                    key = current_key.toWIF()
                }
            }
            const convertedKeys = GetAddresses("", [key])
            await window.electron.removeAddresses(convertedKeys)
            await window.electron.removeKeys([key])
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
                        <h2>Remove address</h2>
                        <div>
                            {address && <p>Removing address: {address}</p>}
                        </div>
                        <div>
                            <button onClick={() => onSubmit(address)}>Remove</button>
                            <button onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                </div>
            </Modal>
        )
    }

export default RemoveModal
