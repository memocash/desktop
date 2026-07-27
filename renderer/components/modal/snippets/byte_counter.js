import styles from "../../../styles/modal.module.css"

// Remaining space for a message that has to fit in a single OP_RETURN output.
// Shown live so an over-long post is obvious before it is submitted, rather
// than surfacing as an error dialog after the fact.
const ByteCounter = ({used, max}) => {
    const remaining = max - used
    return (
        <div className={[styles.counter, remaining < 0 ? styles.counter_over : null].filter(c => c).join(" ")}
             aria-live={"polite"}>
            {remaining >= 0 ?
                <>{remaining.toLocaleString()} byte{remaining === 1 ? "" : "s"} left</> :
                <>{(-remaining).toLocaleString()} byte{remaining === -1 ? "" : "s"} over the {max} byte limit</>}
        </div>
    )
}

export {
    ByteCounter,
}
