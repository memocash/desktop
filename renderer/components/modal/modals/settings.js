import Modal, {ModalFooter} from "../modal"
import styles from "../../../styles/modal.module.css"
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {Modals, WalletErrors} from "../../../../main/common/util";
import {ConfirmModeOf, ConfirmValues, ThresholdError, ThresholdInUse} from "./settings_core";

// What each send confirmation choice means, for a wallet with a password and one
// without.
const confirmHints = {
    encrypted: {
        every: "Every send asks for the password and shows where it pays.",
        limit: "Sends up to that total go through without the password and without showing you " +
            "where they pay. Once it is used up, the next send asks, and the password starts the " +
            "total again. Token sends always ask.",
        never: "Sends, token sends included, go through with no password while the wallet is open. " +
            "Anything running in this window can spend this wallet. The file stays encrypted, and " +
            "exports still ask for the password.",
    },
    passwordless: {
        every: "Every transaction, posts and likes included, is shown for approval before it is " +
            "signed.",
        limit: "Sends up to that total go through without asking. Once it is used up, the next " +
            "send asks, and approving it starts the total again. Token sends always ask.",
        never: "Sends are signed with nothing shown. Anything running in this window can spend " +
            "this wallet.",
    },
}

// The two kinds of setting, each on its own tab with its own button row. The
// Wallet tab's settings live in the wallet file and go through main behind its
// Save button; the Application tab's apply as soon as they change, so it has no
// Save button to wonder about. Both panes stay mounted so a change on one
// survives a look at the other.
const Panes = {Wallet: "wallet", Application: "application"}

// Preferences, opened from the app menu.
const SettingsModal = ({onClose, setModal}) => {
    const [pane, setPane] = useState(Panes.Wallet)
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
        // Every wallet asks before its sends - for the password if it has one,
        // for an approval if not: every time, over a running total, or -
        // deliberately - not at all.
        const mode = ConfirmModeOf(wallet.settings)
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
    // saved on change; the Application tab has no Save button.
    const changeTheme = async (value) => {
        setTheme(value)
        await window.electron.setTheme(value)
    }

    // Update checks are app-global as well, so they are saved on change too.
    const changeCheckUpdates = async (value) => {
        setCheckUpdates(value)
        await window.electron.setUpdatePrefs({checkAutomatically: value})
    }

    const save = async (password) => {
        const {error} = await window.electron.changeSettings({
            DirectTx: directTx,
            ...ConfirmValues(confirmMode, threshold),
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

    const thresholdMatters = ThresholdInUse(confirmMode)
    const changed = directTx !== saved.directTx ||
        confirmMode !== saved.confirmMode ||
        (thresholdMatters && Number(threshold) !== saved.threshold)

    const formSubmit = async (e) => {
        e.preventDefault()
        const thresholdError = ThresholdError(confirmMode, threshold)
        if (thresholdError) {
            setError(thresholdError)
            return
        }
        setError("")
        // Main requires the password for any settings change on an encrypted
        // wallet, since the settings decide when the password is asked for.
        // Asking here means the prompt appears before the save rather than as a
        // failure after it. No comparison against the loaded values: this
        // window's copy can be stale, and main asks regardless. A passwordless
        // wallet has nothing to prove here; main puts any loosening of the
        // send confirmation in front of the user in its own dialog instead,
        // as it does for an encrypted wallet turning the password off.
        if (encrypted) {
            setModal(Modals.Password, {onCorrectPassword: save, authenticate: false})
            return
        }
        await save()
    }

    // The two tabs are a strip of their own above the panes, so left and right
    // move between them as they do on the wallet's tab strip.
    const other = pane === Panes.Wallet ? Panes.Application : Panes.Wallet
    const tabKeyDown = (e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            return
        }
        e.preventDefault()
        const next = e.key === "Home" ? Panes.Wallet : e.key === "End" ? Panes.Application : other
        setPane(next)
        document.getElementById(`settings-tab-${next}`)?.focus()
    }
    const tab = (name, title) => <button type="button" role="tab" id={`settings-tab-${name}`}
                                         aria-selected={pane === name} aria-controls={`settings-pane-${name}`}
                                         tabIndex={pane === name ? 0 : -1} onKeyDown={tabKeyDown}
                                         className={pane === name ? styles.tabSelected : undefined}
                                         onClick={() => setPane(name)}>{title}</button>
    // Shared by both panes: the one hidden is still laid out, so the modal keeps
    // the size of the larger whichever is showing.
    const paneProps = (name) => ({
        role: "tabpanel", id: `settings-pane-${name}`, "aria-labelledby": `settings-tab-${name}`,
        className: [styles.pane, pane === name ? undefined : styles.unchosen].filter(c => c).join(" "),
    })

    return (
        <Modal onClose={onClose} title={"Settings"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                {!loaded ? <p>Loading...</p> : <>
                    <div className={styles.tabs} role="tablist" aria-label="Settings sections">
                        {tab(Panes.Wallet, "Wallet")}
                        {tab(Panes.Application, "Application")}
                    </div>
                    <div className={styles.panes}>
                        <form onSubmit={formSubmit} {...paneProps(Panes.Wallet)}>
                            <p className={styles.note}>Saved with this wallet.</p>
                            <div className={styles.option}>
                                <label>
                                    <input checked={directTx} type="checkbox" onChange={
                                        () => setDirectTx(!directTx)}/>
                                    {} Skip transaction preview for Memo actions
                                </label>
                                <div className={styles.hint}>
                                    Likes, posts, follows and other Memo actions go out when you click
                                    them, with no transaction preview first.
                                </div>
                            </div>
                            <div className={styles.option}>
                                <label htmlFor="confirmMode">{encrypted ? "Ask for the password" : "Approve sends"}</label>
                                {} <select id="confirmMode" value={confirmMode}
                                           onChange={(e) => setConfirmMode(e.target.value)}>
                                    <option value="every">Every send</option>
                                    <option value="limit">After a running total</option>
                                    <option value="never">Never</option>
                                </select>
                                {/* Kept in the layout when unused, as are the hints below, so
                                    changing the choice doesn't resize the modal - and disabled
                                    then, so its hidden min can't refuse the submit. */}
                                <span className={thresholdMatters ? undefined : styles.unchosen}>
                                    {} <input id="confirmThreshold" type="number" min="1" step="1"
                                              disabled={!thresholdMatters}
                                              value={threshold} onChange={(e) => setThreshold(e.target.value)}/>
                                    {} satoshis
                                </span>
                                <div className={[styles.hint, styles.hintStack].join(" ")}>
                                    {Object.entries(confirmHints[encrypted ? "encrypted" : "passwordless"]).map(
                                        ([mode, text]) => <span key={mode}
                                            className={mode === confirmMode ? undefined : styles.unchosen}>{text}</span>)}
                                </div>
                            </div>
                            {error.length > 0 && <div className={styles.error}>{error}</div>}
                            <ModalFooter>
                                <button type="button" onClick={onClose}>Close</button>
                                <button type="submit" className={"button_primary"} disabled={!changed}>Save</button>
                            </ModalFooter>
                        </form>
                        <div {...paneProps(Panes.Application)}>
                            <p className={styles.note}>Saved as soon as they change.</p>
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
                            <ModalFooter>
                                <button type="button" onClick={onClose}>Close</button>
                            </ModalFooter>
                        </div>
                    </div>
                </>}
            </div>
        </Modal>
    )
}

export default SettingsModal
