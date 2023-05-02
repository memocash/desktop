import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import {ListenPosts, UpdatePosts} from "../../../wallet/update/index";

const PostModal = ({basic: {setModal, onClose, setChatRoom}, modalProps: {txHash}}) => {
    if(!txHash){
        return null
    }
    const [post, setPost] = useState({})
    const [txHashes, setTxHashes] = useState([])
    const [lastUpdate, setLastUpdate] = useState(null)
    useEffect(() => {(async () => {
        const post = await loadPost()
        let txHashes = [post.tx_hash]
        if (post.parent) {
            txHashes.push(post.parent.tx_hash)
        }
        if (post.replies) {
            for (let i = 0; i < post.replies.length; i++) {
                txHashes.push(post.replies[i].tx_hash)
            }
        }
        setTxHashes(txHashes)
        await UpdatePosts({txHashes})
        await loadPost()
    })()}, [txHash, lastUpdate])
    useEffect(() => {
        if (!txHashes || !txHashes.length) {
            return
        }
        const closeSocket = ListenPosts({txHashes, setLastUpdate})
        return () => closeSocket()
    }, [txHashes])
    const loadPost = async () => {
        const {addresses} = await window.electron.getWallet()
        const post = await window.electron.getPost({txHash, userAddresses: addresses})
        post.replies = await window.electron.getPostReplies({txHash, userAddresses: addresses})
        post.parent = await window.electron.getPostParent({txHash, userAddresses: addresses})
        setPost(post)
        return post
    }
    return (
        <Modal onClose={onClose}>
            <div className={post.parent ? profile.post_parent_wrapper : null}>
                {post.parent &&
                    <div className={profile.post_parent}>
                        <Post post={post.parent} setModal={setModal} setChatRoom={setChatRoom}/>
                    </div>
                }
                <Post post={post} setModal={setModal} isSingle={true} setChatRoom={setChatRoom}/>
                {post.replies && post.replies.length > 0 && (
                    <div className={profile.replies}>
                        {post.replies.map((reply, i) => {
                            return (
                                <Post key={i} post={reply} setModal={setModal} setChatRoom={setChatRoom}/>
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
