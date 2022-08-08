import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";

const PostCreate = ({onClose}) => {
    return (
        <Modal onClose={onClose}>
            <div className={profile.body_modal}>
                Create a new post
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostCreate
