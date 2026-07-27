import styles from "../../styles/loading.module.css"

// Shared busy indicator, so every list in the app signals loading the same way
// instead of some spinning and others showing bare "Loading..." text.
const Spinner = () => <span className={styles.spinner}/>

const Loading = ({children}) => (
    <div className={styles.loading} role={"status"} aria-live={"polite"}>
        <Spinner/>
        {children}
    </div>
)

export {
    Loading,
    Spinner,
}
