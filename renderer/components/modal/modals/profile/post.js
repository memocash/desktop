import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {Modals} from "../../../../../main/common/util";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";

const PostModal = ({setModal, modalProps: {txHash}}) => {
    const onClose = () => setModal(Modals.None)
    const [post, setPost] = useState({})
    useEffect(async () => {
        const post = await window.electron.getPost(txHash)
        setPost(post)
    }, [txHash])
    return (
        <Modal onClose={onClose}>
            <Post post={post} setModal={setModal} isSingle={true}/>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostModal
