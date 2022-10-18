import Modal from "../modal"
import styles from "../../../styles/modal.module.css"
import Password from "./password";

const GetPassword = ({onClose, modalProps: {onCorrectPassword}}) => {
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <Password onClose={onClose} onCorrectPassword={onCorrectPassword}/>
            </div>
        </Modal>
    )
}

export default GetPassword
