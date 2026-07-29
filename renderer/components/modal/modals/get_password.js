import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";

const GetPassword = ({onClose, modalProps: {onCorrectPassword, authenticate}}) => {
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <Password onClose={onClose} onCorrectPassword={onCorrectPassword} authenticate={authenticate}/>
            </div>
        </Modal>
    )
}

export default GetPassword
