import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";

const SettingsModal = ({onClose}) => {
    const [directTx, setDirectTx] = useState(true)
    const [theme, setTheme] = useState("system")
    const [checkUpdates, setCheckUpdates] = useState(true)
    useEffect(() => {(async () => {
        let wallet = await GetWallet()
        setDirectTx(wallet.settings.DirectTx)
        setTheme(await window.electron.getTheme())
        setCheckUpdates((await window.electron.getUpdatePrefs()).checkAutomatically)
    })()},[])

    // Appearance is app-global and applied immediately via nativeTheme, so it is
    // saved on change rather than waiting for the Save button.
    const changeTheme = async (value) => {
        setTheme(value)
        await window.electron.setTheme(value)
    }

    // Update checks are app-global as well, so they are saved on change rather
    // than with the wallet settings behind the Save button.
    const changeCheckUpdates = async (value) => {
        setCheckUpdates(value)
        await window.electron.setUpdatePrefs({checkAutomatically: value})
    }

    const save = async () => {
        await window.electron.changeSettings({DirectTx: directTx})
        onClose()
    }

    const formSubmit = async (e) => {
        e.preventDefault()
        await save()
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
                        <input checked={checkUpdates} type="checkbox" id="checkUpdates" onChange={
                            () => changeCheckUpdates(!checkUpdates)}/>
                        <label htmlFor="checkUpdates">Automatically check for new versions</label>
                    </div>
                    <div>
                        <label htmlFor="theme">Appearance:</label>
                        {} <select id="theme" value={theme} onChange={(e) => changeTheme(e.target.value)}>
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </div>
                    <input type="submit" value="Save"/>
                    <button onClick={onClose}>Close</button>
                </form>
            </div>
        </Modal>
    )
}

export default SettingsModal
