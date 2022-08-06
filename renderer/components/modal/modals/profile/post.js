import Modal from "../../modal";
import Post from "../../../wallet/memo/post";
import {Modals} from "../../../../../main/common/util";

const PostModal = ({setModal, modalProps: {post, setAddress}}) => {
    const onClose = () => setModal(Modals.None)
    return (
        <Modal onClose={onClose}>
            <Post post={post} setAddress={setAddress} setModal={setModal}/>
        </Modal>
    )
}

export default PostModal
