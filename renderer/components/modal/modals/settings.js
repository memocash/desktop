import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {Modals} from "../../../../main/common/util";

const SettingsModal = ({onClose, setModal}) => {
    const [directTx, setDirectTx] = useState(true)
    const [threshold, setThreshold] = useState("0")
    const [savedThreshold, setSavedThreshold] = useState(0)
    const [encrypted, setEncrypted] = useState(false)
    const [error, setError] = useState("")
    const [theme, setTheme] = useState("system")
    const [checkUpdates, setCheckUpdates] = useState(true)
    useEffect(() => {(async () => {
        let wallet = await GetWallet()
        setDirectTx(wallet.settings.DirectTx)
        setThreshold(String(wallet.settings.PasswordThreshold || 0))
        setSavedThreshold(wallet.settings.PasswordThreshold || 0)
        setEncrypted((await window.electron.getWalletFileInfo()).encrypted)
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

    const save = async (password) => {
        const {error} = await window.electron.changeSettings({
            DirectTx: directTx,
            PasswordThreshold: Number(threshold),
        }, password)
        if (error) {
            return false
        }
        onClose()
        return true
    }

    const formSubmit = async (e) => {
        e.preventDefault()
        const wanted = Number(threshold)
        if (!Number.isSafeInteger(wanted) || wanted < 0) {
            setError("Enter a whole number of satoshis, or 0 to always ask.")
            return
        }
        setError("")
        // Main requires the password to change this, since it decides when the
        // password is asked for. Asking here means the prompt appears before the
        // save rather than as a failure after it.
        if (encrypted && wanted !== savedThreshold) {
            setModal(Modals.Password, {onCorrectPassword: save, authenticate: false})
            return
        }
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
                        <label htmlFor="passwordThreshold">Ask for the password after sending</label>
                        {} <input id="passwordThreshold" type="number" min="0" step="1" size="10"
                                  value={threshold} onChange={(e) => setThreshold(e.target.value)}/>
                        {} satoshis in a session
                    </div>
                    <div className={styles.text}>
                        0 asks every time. Above 0, sends up to that total go through without the
                        password until it is used up. Token sends and exports always ask.
                    </div>
                    {error.length > 0 && <div className={styles.text}>{error}</div>}
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
