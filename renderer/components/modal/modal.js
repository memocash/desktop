import styles from "./modal.module.css"

const Modal = ({children, onClose}) => {
    return (
        <div className={styles.root} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    )
}

export default Modal
