import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util";
import {useEffect, useState} from "react";

const PostLikes = ({setModal, modalProps: {txHash}}) => {
    const onClose = () => setModal(Modals.None)
    const [likes, setLikes] = useState([])
    useEffect(async () => {
        const likes = await window.electron.getLikes(txHash)
        setLikes(likes)
        console.log(likes)
    }, [txHash])
    return (
        <Modal onClose={onClose}>
            <h3>Likes</h3>
            {likes.map((like, i) => {
                return (
                    <div key={i}>
                        {like.address} - {like.tip} - {like.timestamp}
                    </div>
                )
            })}
        </Modal>
    )
}

export default PostLikes
