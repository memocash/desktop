import Modal, {ModalFooter} from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {Modals} from "../../../../main/common/util";

// Preferences, opened from the app menu. Two kinds of setting live here: the
// ones stored in the wallet file, which go through main behind the Save button,
// and the app-wide ones, which apply as soon as they change. They are grouped
// and labelled so the Save button clearly belongs to the first kind only.
const SettingsModal = ({onClose, setModal}) => {
    const [loaded, setLoaded] = useState(false)
    const [directTx, setDirectTx] = useState(true)
    const [threshold, setThreshold] = useState("0")
    const [saved, setSaved] = useState({directTx: true, threshold: 0})
    const [encrypted, setEncrypted] = useState(false)
    const [error, setError] = useState("")
    const [theme, setTheme] = useState("system")
    const [checkUpdates, setCheckUpdates] = useState(true)
    useEffect(() => {(async () => {
        let wallet = await GetWallet()
        const walletThreshold = wallet.settings.PasswordThreshold || 0
        setDirectTx(wallet.settings.DirectTx)
        setThreshold(String(walletThreshold))
        setSaved({directTx: wallet.settings.DirectTx, threshold: walletThreshold})
        setEncrypted((await window.electron.getWalletFileInfo()).encrypted)
        setTheme(await window.electron.getTheme())
        setCheckUpdates((await window.electron.getUpdatePrefs()).checkAutomatically)
        setLoaded(true)
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
            // A wrong password lands here too, and the password modal is the one
            // on screen in that case, so it reports it. This message is for the
            // save that failed with the settings still in front of the user.
            setError("Could not save settings: " + error)
            return false
        }
        onClose()
        return true
    }

    const changed = directTx !== saved.directTx || Number(threshold) !== saved.threshold

    const formSubmit = async (e) => {
        e.preventDefault()
        const wanted = Number(threshold)
        if (!threshold.trim().length || !Number.isSafeInteger(wanted) || wanted < 0) {
            setError("Enter a whole number of satoshis, or 0 to always ask.")
            return
        }
        setError("")
        // Main requires the password to change this, since it decides when the
        // password is asked for. Asking here means the prompt appears before the
        // save rather than as a failure after it.
        if (encrypted && wanted !== saved.threshold) {
            setModal(Modals.Password, {onCorrectPassword: save, authenticate: false})
            return
        }
        await save()
    }

    return (
        <Modal onClose={onClose} title={"Settings"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                {!loaded ? <p>Loading...</p> : <form onSubmit={formSubmit}>
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Sending <span>Saved with this wallet</span></h3>
                        <div className={styles.option}>
                            <label>
                                <input checked={directTx} type="checkbox" onChange={
                                    () => setDirectTx(!directTx)}/>
                                {} Send transactions without previewing
                            </label>
                            <div className={styles.hint}>
                                Skips the preview and broadcasts as soon as a send is confirmed.
                            </div>
                        </div>
                        <div className={styles.option}>
                            <label htmlFor="passwordThreshold">Ask for the password after sending</label>
                            {} <input id="passwordThreshold" type="number" min="0" step="1"
                                      value={threshold} onChange={(e) => setThreshold(e.target.value)}/>
                            {} satoshis in a session
                            <div className={styles.hint}>
                                0 asks every time. Above 0, sends up to that total go through without the
                                password and without showing you where they pay, until it is used up.
                                Token sends and exports always ask.
                            </div>
                        </div>
                    </div>
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>Application <span>Saved right away</span></h3>
                        <div className={styles.option}>
                            <label>
                                <input checked={checkUpdates} type="checkbox" onChange={
                                    () => changeCheckUpdates(!checkUpdates)}/>
                                {} Automatically check for new versions
                            </label>
                        </div>
                        <div className={styles.option}>
                            <label htmlFor="theme">Appearance:</label>
                            {} <select id="theme" value={theme} onChange={(e) => changeTheme(e.target.value)}>
                                <option value="system">System</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </div>
                    </div>
                    {error.length > 0 && <div className={styles.error}>{error}</div>}
                    <ModalFooter>
                        <button type="button" onClick={onClose}>Close</button>
                        <button type="submit" className={"button_primary"} disabled={!changed}>Save</button>
                    </ModalFooter>
                </form>}
            </div>
        </Modal>
    )
}

export default SettingsModal
