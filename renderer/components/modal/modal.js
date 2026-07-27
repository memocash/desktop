import {useEffect} from "react"
import styles from "../../styles/modal.module.css"

// Shared modal chrome. Modals opt into the standard layout by passing a title
// (and optionally a description) and wrapping their button row in ModalFooter,
// so every dialog gets the same heading, spacing and button order instead of
// each one inventing its own.
const Modal = ({children, onClose, className, title, description}) => {
    useEffect(() => {
        if (!onClose) {
            return
        }
        const keyDown = (e) => {
            if (e.key === "Escape") {
                onClose()
            }
        }
        window.addEventListener("keydown", keyDown)
        return () => window.removeEventListener("keydown", keyDown)
    }, [onClose])
    return (
        <div className={styles.wrapper} onClick={onClose}>
            <div className={[styles.modal, className].filter(c => c).join(" ")}
                 role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
                 onClick={e => e.stopPropagation()}>
                {title ? <div className={styles.header}>
                    <h2>{title}</h2>
                    {description ? <p className={styles.description}>{description}</p> : null}
                </div> : null}
                {children}
            </div>
        </div>
    )
}

// Button row for the bottom of a modal. Children are laid out left to right, so
// pass secondary actions (Cancel/Close) first and the primary action last.
const ModalFooter = ({children}) => <div className={styles.buttons}>{children}</div>

export {
    ModalFooter,
}

export default Modal
