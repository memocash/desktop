import styles from "./index.module.css"

const Modal = ({
    children,
    isOpen,
    onClose
}) => {
    
    return (
        <>
            {isOpen &&
                <div className={styles.root} onClick={onClose}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        {children}
                    </div>
                </div>
            }
        </>
    )
}

export default Modal
