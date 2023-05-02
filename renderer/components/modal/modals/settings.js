import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {Modals} from "../../../../main/common/util";

const SettingsModal = ({onClose, setLastUpdate, setModal}) => {
    const [directTx, setDirectTx] = useState(true)
    const [skipPassword, setSkipPassword] = useState(true)
    const [enableSkipPassword, setEnableSkipPassword] = useState(false)
    const [initialSkipPassword, setInitialSkipPassword] = useState(true)
    useEffect(() => {(async () => {
        let wallet = await GetWallet()
        setDirectTx(wallet.settings.DirectTx)
        setSkipPassword(wallet.settings.SkipPassword)
        setInitialSkipPassword(wallet.settings.SkipPassword)
    })()},[])

    const toggleSkipPassword = () => {
        if(skipPassword) {
            setSkipPassword(!skipPassword)
            setEnableSkipPassword(false)
        }
        else{
            setSkipPassword(!skipPassword)
            setEnableSkipPassword(true)
        }
    }

    const save = async () => {
        await window.electron.changeSettings({
            DirectTx: directTx,
            SkipPassword: skipPassword})
        onClose()
    }

    const formSubmit = async (e) => {
        e.preventDefault()
        if(enableSkipPassword && !initialSkipPassword){
            setModal(Modals.Password,
                {onCorrectPassword: async () => await save()})
        }
        else{
            await save()
        }

    }

    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <form onSubmit={formSubmit}>
                    <div>
                        <input checked={directTx} type="checkbox" id="directTxChecked" onChange={
                            () => setDirectTx(!directTx)}/>
                        <label htmlFor="directTxChecked">Send transactions without previewing</label>

                    </div>
                    <div>
                        <input checked={skipPassword} type="checkbox" id="skipPassword" onChange={toggleSkipPassword}/>
                        <label htmlFor="skipPassword">Skip Password for basic transactions</label>
                    </div>
                    <input type="submit" value="Save"/>
                    <button onClick={onClose}>Close</button>
                </form>
            </div>
        </Modal>
    )
}

export default SettingsModal
