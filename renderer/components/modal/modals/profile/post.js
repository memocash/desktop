import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {Modals} from "../../../../../main/common/util";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";

const PostModal = ({setModal, modalProps: {txHash}}) => {
    const onClose = () => setModal(Modals.None)
    const [post, setPost] = useState({})
    useEffect(async () => {
        const post = await window.electron.getPost(txHash)
        post.replies = await window.electron.getPostReplies(txHash)
        post.parent = await window.electron.getPostParent(txHash)
        setPost(post)
    }, [txHash])
    return (
        <Modal onClose={onClose}>
            <div className={post.parent ? profile.post_parent_wrapper : null}>
                {post.parent &&
                    <div className={profile.post_parent}>
                        <Post post={post.parent} setModal={setModal}/>
                    </div>
                }
                <Post post={post} setModal={setModal} isSingle={true}/>
                {post.replies && post.replies.length > 0 && (
                    <div className={profile.replies}>
                        {post.replies.map((reply, i) => {
                            return (
                                <Post key={i} post={reply} setModal={setModal}/>
                            )
                        })}
                    </div>
                )}
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostModal
