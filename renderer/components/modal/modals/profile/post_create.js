import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import profile from "../../../../styles/profile.module.css";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "bitcoinjs-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";

const PostCreate = ({onClose}) => {
    const postInputRef = useRef()
    const formPostSubmit = async (e) => {
        e.preventDefault()
        const post = postInputRef.current.value
        if (post && Buffer.from(post).length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog("Post length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
            return
        }
        const postOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.PostMemo, "hex"),
            Buffer.from(post),
        ])
        const wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: postOpReturnOutput}])
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formPostSubmit}>
                    <label>
                        <span>Message:</span>
                    </label>
                    <input ref={postInputRef} type="text"/>
                    <input type="submit" value="Post"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default PostCreate
