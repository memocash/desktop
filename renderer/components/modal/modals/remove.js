import {useEffect, useState} from "react"
import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import GetWallet from "../../util/wallet"
import {Modals} from "../../../../main/common/util/modals";

const RemoveModal = ({basic: {onClose, setLastUpdate, setModal}, modalProps:{address}}) => {
    const onSubmit = async (address) => {
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (encrypted) {
            setModal(Modals.Password, {
                onCorrectPassword: async (password) => {
                    await remove(address, password)
                }
            })
        } else {
            await remove(address)
        }
    }
    const remove = async (address, password) => {
        const wallet = await GetWallet()
        // removeAddresses takes a list. A bare string used to survive the old
        // preload's filter by accident, and the update now refuses one.
        const {error} = wallet.walletType !== "watch"
            ? await window.electron.removePrivateKey(address, password)
            : await window.electron.removeAddresses([address])
        // Both answer with a result rather than rejecting, so a refusal reaches
        // the dialog instead of stopping this function at the destructuring.
        if (error) {
            window.electron.showMessageDialog(error)
            return
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
