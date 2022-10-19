import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";


const SettingsModal = ({onClose, setLastUpdate}) => {
    const [directTx, setdirectTx] = useState(true)
    useEffect(async  () => {
        let wallet = await GetWallet()
        setdirectTx(wallet.settings.DirectTx)
    },[])

    const onToggle = async () => {
        setdirectTx(!directTx)
    }
    const formSubmit = async () => {
        await window.electron.changeSettings({DirectTx: directTx})
        setLastUpdate((new Date()).toISOString())
        onClose()
    }

    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <form onSubmit={formSubmit}>
                    <input checked={directTx} type="checkbox" id="directTxChecked" onClick={onToggle}/>
                    <label htmlFor="directTxChecked">Send transactions without previewing</label>
                    <input type="submit" value="Save"/>
                    <button onClick={onClose}>Close</button>
                </form>
            </div>
        </Modal>
    )
}

export default SettingsModal
