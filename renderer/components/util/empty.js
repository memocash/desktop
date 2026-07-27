import styles from "../../styles/empty.module.css"

// Shared empty state, so every tab that comes up with nothing says so the same
// way: an icon, a short title, and a line about what will fill the space.
// Tables render it as a full-width row (grid-column in the stylesheet), so it
// stays centered instead of being squeezed into the first column.
const EmptyState = ({icon, title, children}) => (
    <div className={styles.empty}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <h3 className={styles.title}>{title}</h3>
        {children ? <p className={styles.body}>{children}</p> : null}
    </div>
)

export {
    EmptyState,
}
