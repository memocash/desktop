import Modal from "./modal"
import styles from "./seed.module.css"
import {useRef} from "react";

const ProfileModal = ({onClose, viewProfile}) => {
    const addressInputRef = useRef()
    const handleEnterAddress = async () => {
        const enteredAddress = addressInputRef.current.value
        viewProfile(enteredAddress)
        onClose()
    }
    const handleKeyDown = async (e) => {
        if (e.keyCode === 13) {
            await handleEnterAddress()
        }
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.text}>Profile to view</div>
            <div>
                <label>Address:
                    <input autoFocus ref={addressInputRef} onKeyDown={handleKeyDown} type="text"/>
                </label>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
                <button onClick={handleEnterAddress}>OK</button>
            </div>
        </Modal>
    )
}

export default ProfileModal
