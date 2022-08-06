import styles from "../../styles/modal.module.css"

const Modal = ({children, onClose}) => {
    return (
        <div className={styles.wrapper} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    )
}

export default Modal
