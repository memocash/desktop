import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {Modals} from "../../../../../main/common/util";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import {UpdatePosts} from "../../../wallet/update/posts";
import {useReferredState} from "../../../util/state";

const PostModal = ({setModal, modalProps: {txHash}}) => {
    const onClose = () => setModal(Modals.None)
    const [post, postRef, setPost] = useReferredState({})
    const [lastUpdate, setLastUpdate] = useState(0)
    useEffect(async () => {
        const post = await window.electron.getPost(txHash)
        post.replies = await window.electron.getPostReplies(txHash)
        post.parent = await window.electron.getPostParent(txHash)
        setPost(post)
    }, [lastUpdate])
    useEffect(async () => {
        if (!postRef.current.tx_hash) {
            return
        }
        let txHashes = [postRef.current.tx_hash]
        if (postRef.current.parent) {
            txHashes.push(postRef.current.parent.tx_hash)
        }
        if (postRef.current.replies) {
            for (let i = 0; i < postRef.current.replies.length; i++) {
                txHashes.push(postRef.current.replies[i].tx_hash)
            }
        }
        await UpdatePosts({txHashes, setLastUpdate})
    }, [postRef])
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
