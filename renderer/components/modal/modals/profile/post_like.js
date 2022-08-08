import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import {Modals} from "../../../../../main/common/util";

const PostLike = ({setModal, modalProps: {txHash, utxosRef}}) => {
    const onClose = () => setModal(Modals.None)
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                Like Post <button onClick={() => setModal(Modals.Post, {txHash})}>Post</button>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default PostLike
