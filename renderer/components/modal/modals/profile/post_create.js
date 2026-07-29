import Modal, {ModalFooter} from "../../modal";
import styles from "../../../../styles/modal.module.css";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useState} from "react";
import {ByteCounter} from "../../snippets/byte_counter";

const PostCreate = ({onClose, setModal}) => {
    const [post, setPost] = useState("")
    const maxBytes = bitcoin.Fee.MaxOpReturn
    const usedBytes = bitcoin.Utf8ByteLength(post)
    const canPost = usedBytes > 0 && usedBytes <= maxBytes
    const formPostSubmit = async (e) => {
        e.preventDefault()
        if (!canPost) {
            return
        }
        const postOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.PostMemo, "hex"),
            Buffer.from(post),
        ])
        const wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: postOpReturnOutput}], setModal)
        const {encrypted} = await window.electron.getWalletFileInfo()
        if (!wallet.settings.DirectTx || !encrypted) {
            onClose()
        }
    }
    return (
        <Modal onClose={onClose} title={"New post"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <form onSubmit={formPostSubmit}>
                    <label htmlFor={"post-message"}>Message</label>
                    <textarea id={"post-message"} className={styles.textarea} autoFocus value={post}
                              onChange={(e) => setPost(e.target.value)}/>
                    <ByteCounter used={usedBytes} max={maxBytes}/>
                    <ModalFooter>
                        <button type={"button"} onClick={onClose}>Cancel</button>
                        <input type="submit" className={"button_primary"} value="Post" disabled={!canPost}/>
                    </ModalFooter>
                </form>
            </div>
        </Modal>
    )
}

export default PostCreate
