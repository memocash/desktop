import Modal, {ModalFooter} from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {Modals, WalletErrors} from "../../../../main/common/util";

// Preferences, opened from the app menu. Two kinds of setting live here: the
// ones stored in the wallet file, which go through main behind the Save button,
// and the app-wide ones, which apply as soon as they change. They are grouped
// and labelled so the Save button clearly belongs to the first kind only.
const SettingsModal = ({onClose, setModal}) => {
    const [loaded, setLoaded] = useState(false)
    const [directTx, setDirectTx] = useState(true)
    const [threshold, setThreshold] = useState("0")
    const [confirmMode, setConfirmMode] = useState("every")
    const [saved, setSaved] = useState({directTx: true, threshold: 0, confirmMode: "every"})
    const [encrypted, setEncrypted] = useState(false)
    const [error, setError] = useState("")
    const [theme, setTheme] = useState("system")
    const [checkUpdates, setCheckUpdates] = useState(true)
    useEffect(() => {(async () => {
        let wallet = await GetWallet()
        const walletThreshold = wallet.settings.PasswordThreshold || 0
        // A passwordless wallet confirms its sends instead of asking for a
        // password: every time, over a running total, or - deliberately - not
        // at all. The same threshold field carries the total in both cases.
        const mode = wallet.settings.ConfirmSends === false ? "never" :
            (walletThreshold > 0 ? "limit" : "every")
        setDirectTx(wallet.settings.DirectTx)
        setThreshold(String(walletThreshold))
        setConfirmMode(mode)
        setSaved({directTx: wallet.settings.DirectTx, threshold: walletThreshold, confirmMode: mode})
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
        const {error} = await window.electron.changeSettings(encrypted ? {
            DirectTx: directTx,
            PasswordThreshold: Number(threshold),
        } : {
            DirectTx: directTx,
            PasswordThreshold: confirmMode === "limit" ? Number(threshold) : 0,
            ConfirmSends: confirmMode !== "never",
        }, password)
        if (error) {
            // A wrong password lands here too, and the password modal is the one
            // on screen in that case, so it reports it. This message is for the
            // save that failed with the settings still in front of the user.
            setError("Could not save settings: " + error)
            // Which of the two it was, for the prompt in front: false for a wrong
            // password, the message for a save that failed for its own reasons.
            return error === WalletErrors.WrongPassword ? false : error
        }
        onClose()
        return true
    }

    const thresholdMatters = encrypted || confirmMode === "limit"
    const changed = directTx !== saved.directTx ||
        (!encrypted && confirmMode !== saved.confirmMode) ||
        (thresholdMatters && Number(threshold) !== saved.threshold)

    const formSubmit = async (e) => {
        e.preventDefault()
        const wanted = Number(threshold)
        if (thresholdMatters &&
            (!threshold.trim().length || !Number.isSafeInteger(wanted) || wanted < (encrypted ? 0 : 1))) {
            setError(encrypted ? "Enter a whole number of satoshis, or 0 to always ask." :
                "Enter a whole number of satoshis above zero.")
            return
        }
        setError("")
        // Main requires the password for any settings change on an encrypted
        // wallet, since the settings decide when the password is asked for.
        // Asking here means the prompt appears before the save rather than as a
        // failure after it. No comparison against the loaded values: this
        // window's copy can be stale, and main asks regardless. A passwordless
        // wallet has nothing to prove here; main puts any loosening of the
        // send confirmation in front of the user in its own dialog instead.
        if (encrypted) {
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
                        {encrypted ? <div className={styles.option}>
                            <label htmlFor="passwordThreshold">Ask for the password after sending</label>
                            {} <input id="passwordThreshold" type="number" min="0" step="1"
                                      value={threshold} onChange={(e) => setThreshold(e.target.value)}/>
                            {} satoshis in a session
                            <div className={styles.hint}>
                                0 asks every time. Above 0, sends up to that total go through without the
                                password and without showing you where they pay, until it is used up.
                                Token sends and exports always ask.
                            </div>
                        </div> : <div className={styles.option}>
                            <label htmlFor="confirmMode">Confirm sends</label>
                            {} <select id="confirmMode" value={confirmMode}
                                       onChange={(e) => setConfirmMode(e.target.value)}>
                                <option value="every">Every send</option>
                                <option value="limit">After a running total</option>
                                <option value="never">Never</option>
                            </select>
                            {confirmMode === "limit" && <>
                                {} <input id="confirmThreshold" type="number" min="1" step="1"
                                          value={threshold} onChange={(e) => setThreshold(e.target.value)}/>
                                {} satoshis
                            </>}
                            <div className={styles.hint}>
                                {confirmMode === "every" && "Every payment out of this wallet is shown " +
                                    "for approval before it is signed. Posts and likes don't ask."}
                                {confirmMode === "limit" && "Sends up to that total go through without " +
                                    "asking. Once it is used up, the next send asks, and approving it " +
                                    "starts the total again. Token sends always ask."}
                                {confirmMode === "never" && "Sends are signed with nothing shown. " +
                                    "Anything running in this window can spend this wallet."}
                            </div>
                        </div>}
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
