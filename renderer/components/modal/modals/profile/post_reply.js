import Modal, {ModalFooter} from "../../modal";
import styles from "../../../../styles/modal.module.css";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {useEffect, useState} from "react";
import Post from "../../../wallet/memo/post";
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {Modals} from "../../../../../main/common/util";
import {ByteCounter} from "../../snippets/byte_counter";

const PostReply = ({basic: {setModal, onClose, setChatRoom}, modalProps: {txHash}}) => {
    const [post, setPost] = useState({})
    const [message, setMessage] = useState("")
    // A reply also carries the parent transaction hash in the same OP_RETURN,
    // so it has less room for text than a top level post.
    const maxBytes = bitcoin.Fee.GetMaxContentWithTxHash()
    const usedBytes = bitcoin.Utf8ByteLength(message)
    const canReply = usedBytes > 0 && usedBytes <= maxBytes
    useEffect(() => {(async () => {
        const {addresses} = await window.electron.getWallet()
        const post = await window.electron.getPost({txHash, userAddresses: addresses})
        setPost(post)
    })()}, [txHash])
    const formReplySubmit = async (e) => {
        e.preventDefault()
        if (!canReply) {
            return
        }
        const replyOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ReplyMemo, "hex"),
            Buffer.from(txHash, "hex").reverse(),
            Buffer.from(message),
        ])
        let wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: replyOpReturnOutput}], setModal)
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (wallet.settings.DirectTx && encrypted) {
            return
        }
        setModal(Modals.Post, {txHash})
    }
    return (
        <Modal onClose={onClose} title={"Reply"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <Post post={post} setModal={setModal} isSingle={true} setChatRoom={setChatRoom}/>
                <form onSubmit={formReplySubmit}>
                    <label htmlFor={"reply-message"}>Message</label>
                    <textarea id={"reply-message"} className={styles.textarea} autoFocus value={message}
                              onChange={(e) => setMessage(e.target.value)}/>
                    <ByteCounter used={usedBytes} max={maxBytes}/>
                    <ModalFooter>
                        <button type={"button"} onClick={onClose}>Cancel</button>
                        <input type="submit" className={"button_primary"} value="Reply" disabled={!canReply}/>
                    </ModalFooter>
                </form>
            </div>
        </Modal>
    )
}

export default PostReply
