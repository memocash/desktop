import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {Modals} from "../../../../../main/common/util";
import {useEffect, useState} from "react";

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
        </Modal>
    )
}

export default PostModal
