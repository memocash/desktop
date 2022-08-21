import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {useEffect, useRef, useState} from "react";
import Post from "../../../wallet/memo/post";
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {Modals} from "../../../../../main/common/util";

const PostReply = ({basic: {setModal, onClose, setChatRoom}, modalProps: {txHash}}) => {
    const [post, setPost] = useState({})
    const messageInputRef = useRef()
    useEffect(async () => {
        const {addresses} = await window.electron.getWallet()
        const post = await window.electron.getPost({txHash, userAddresses: addresses})
        setPost(post)
    }, [txHash])
    const formReplySubmit = async (e) => {
        e.preventDefault()
        const message = messageInputRef.current.value
        if (!message || message.length === 0) {
            window.electron.showMessageDialog("Must include a reply message")
            return
        } else if (message && Buffer.from(message).length > bitcoin.Fee.GetMaxContentWithTxHash()) {
            window.electron.showMessageDialog("Reply length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
            return
        }
        const replyOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ReplyMemo, "hex"),
            Buffer.from(txHash, "hex").reverse(),
            Buffer.from(message),
        ])
        await CreateTransaction(await GetWallet(), [{script: replyOpReturnOutput}])
        setModal(Modals.Post, {txHash})
    }
    return (
        <Modal onClose={onClose}>
            <Post post={post} setModal={setModal} isSingle={true} setChatRoom={setChatRoom}/>
            <div className={profile.set_profile}>
                <form onSubmit={formReplySubmit}>
                    <label>
                        <span>Message:</span>
                    </label>
                    {" "}
                    <input ref={messageInputRef} type="text"/>
                    <input type="submit" value="Reply"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostReply
