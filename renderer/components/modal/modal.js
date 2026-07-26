import styles from "../../styles/modal.module.css"

const Modal = ({children, onClose, className}) => {
    return (
        <div className={styles.wrapper} onClick={onClose}>
            <div className={[styles.modal, className].filter(c => c).join(" ")}
                 onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    )
}

export default Modal
