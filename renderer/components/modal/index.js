import styles from "./index.module.css"

const Modal = ({ children, isOpen }) => {
    
    return (
        <>
            {isOpen &&
                <div className={styles.root}>
                    <div className={styles.modal}>
                        {children}
                    </div>
                </div>
            }
        </>
    )
}

export default Modal
