import Modal from "../../modal"
import styles from "../../../../styles/modal.module.css"
import {useRef} from "react";
import {Modals} from "../../../../../main/common/util";

const Find = ({setModal}) => {
    const addressInputRef = useRef()
    const handleKeyDown = (e) => e.keyCode === 13 && handleEnterAddress()
    const handleEnterAddress = () => setModal(Modals.ProfileView, {address: addressInputRef.current.value})
    const onClose = () => setModal(Modals.None)
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

export default Find
