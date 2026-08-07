import Modal, {ModalFooter} from "../modal";
import styles from "../../../styles/modal.module.css";
import {useEffect, useState} from "react";
import {SafeExternalUrl} from "../../../../main/common/util";

// GitHub returns release notes as markdown. They are shown as plain text, so
// strip the markers that would otherwise read as noise rather than pulling in a
// markdown renderer for a few lines of changelog.
const PlainNotes = (notes) => notes
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim()

// Opened from Help > Check for Updates and from clicking the notification a
// background check raises. The check itself lives in the main process, which
// knows the installed version and which download matches this machine.
const UpdateModal = ({onClose}) => {
    const [result, setResult] = useState(null)
    const [checking, setChecking] = useState(true)

    const check = async (force) => {
        setChecking(true)
        try {
            setResult(await window.electron.checkForUpdates(force))
        } finally {
            setChecking(false)
        }
    }
    // Opening the modal reuses a result from the last minute, so clicking through
    // from the notification a background check just raised answers immediately.
    // Check Again always goes back to GitHub.
    useEffect(() => {(async () => await check(false))()}, [])

    const asset = result && result.asset
    // These urls arrive over ipc from main's update check. Main's window-open
    // handler validates whatever is opened anyway; this is the renderer-side
    // check every other link in the app gets (see links.js), so this modal
    // isn't the one place a url is rendered on trust.
    const releaseLink = result && SafeExternalUrl(result.releaseUrl || result.releasesPageUrl)
    const downloadUrl = (asset && SafeExternalUrl(asset.url)) || releaseLink
    const download = () => downloadUrl && window.open(downloadUrl)

    const status = () => {
        if (checking || !result) {
            return "Checking for updates..."
        }
        if (result.error) {
            return "Could not check for updates: " + result.error
        }
        if (result.updateAvailable) {
            return "A new version of Memo is available."
        }
        if (!result.latestVersion) {
            return "No releases have been published yet."
        }
        return "Memo is up to date."
    }

    const released = result && result.publishedAt ? new Date(result.publishedAt) : null
    return (
        <Modal onClose={onClose} title={"Software Update"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <p className={[styles.text, result && result.error ? styles.error : ""].join(" ")}>{status()}</p>
                {!result ? null : <dl className={styles.details}>
                    <dt>Installed</dt>
                    <dd>{result.currentVersion}</dd>
                    {!result.latestVersion ? null : <>
                        <dt>Latest</dt>
                        <dd>{result.latestVersion}{released === null ? null :
                            " (released " + released.toLocaleDateString() + ")"}</dd>
                    </>}
                    {!result.updateAvailable || !asset ? null : <>
                        <dt>Download</dt>
                        <dd>{asset.name}</dd>
                    </>}
                </dl>}
                {!result || !result.updateAvailable || !result.releaseNotes ? null :
                    <div className={styles.notes}>{PlainNotes(result.releaseNotes)}</div>}
                {!releaseLink || checking || (!result.error && !result.latestVersion) ? null :
                    <p className={styles.text}>
                        <a href={releaseLink} target={"_blank"} rel={"noreferrer"}>
                            {result.updateAvailable || result.error ? "All releases on GitHub" : "View release notes"}
                        </a>
                    </p>}
                <ModalFooter>
                    <button onClick={onClose}>Close</button>
                    <button onClick={() => check(true)} disabled={checking}>Check Again</button>
                    {!result || !result.updateAvailable || !downloadUrl ? null :
                        <button className={"button_primary"} onClick={download}>
                            {asset ? "Download" : "Get Update"}
                        </button>}
                </ModalFooter>
            </div>
        </Modal>
    )
}

export default UpdateModal
