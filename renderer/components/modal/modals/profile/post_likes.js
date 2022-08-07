import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util";
import profile from "../../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";
import Post from "../../../wallet/memo/post";

const PostLikes = ({setModal, modalProps: {txHash}}) => {
    const onClose = () => setModal(Modals.None)
    const [likes, setLikes] = useState([])
    const [post, setPost] = useState({})
    useEffect(async () => {
        const likes = await window.electron.getLikes(txHash)
        setLikes(likes)
        const post = await window.electron.getPost(txHash)
        setPost(post)
    }, [txHash])
    return (
        <Modal onClose={onClose}>
            <Post post={post} setModal={setModal} isSingle={true}/>
            <div className={profile.likes_list}>
                <div className={profile.post_body}>
                    <h3>Likes</h3>
                    {likes.map((like, i) => {
                        return (
                            <div key={i}>
                                {like.address} - {like.tip} - {like.timestamp}
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostLikes
