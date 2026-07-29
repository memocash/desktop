import styles from "../../styles/log.module.css"
import {ClearActivityLog, Level, useActivity} from "../util/activity"
import {EmptyState} from "../util/empty"
import {Spinner} from "../util/loading"
import {BsJournalText, BsTrash} from "react-icons/bs"

// Times here are for following work as it happens - which of two downloads
// started first, how long a sync sat on one phase - so they're to the second and
// without a date, unlike the table timestamps elsewhere in the wallet.
const logTime = (time) => time.toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
})

// Everything the app is doing, in the order it happened, newest first. Hidden
// by default and turned on from View > Show Log: it answers "is it stuck or is
// it working" without needing the developer console.
const Log = () => {
    const {entries, running} = useActivity()
    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div className={styles.running}>
                    {running.length ? <>
                        <Spinner/>
                        <span>{running[running.length - 1].label}</span>
                        {running.length > 1 ?
                            <span className={styles.count}>+{running.length - 1} more</span> : null}
                    </> : <span>Idle</span>}
                </div>
                <button onClick={ClearActivityLog} disabled={!entries.length}
                        title={"Clear the log"}><BsTrash/> Clear</button>
            </div>
            <div className={styles.list}>
                {entries.length ? entries.map(entry => (
                    <div key={entry.id}
                         className={[styles.entry, entry.level === Level.Error && styles.error]
                             .filter(c => c).join(" ")}>
                        <span className={styles.time}>{logTime(entry.time)}</span>
                        {/* Work usually touches several tabs (a transaction
                            download changes five of them), which spelled out in
                            full would crowd out the message. The first scope is
                            the one the work is named for; the rest are in the
                            tooltip. */}
                        <span className={styles.scopes} title={entry.scopes.join(", ")}>
                            {entry.scopes.length ? entry.scopes[0] : ""}</span>
                        <span className={styles.message}>{entry.message}</span>
                    </div>
                )) : <EmptyState icon={<BsJournalText/>} title={"Nothing logged yet"}>
                    Downloads and updates are listed here as they happen.
                </EmptyState>}
            </div>
        </div>
    )
}

export default Log
