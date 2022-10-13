import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "bitcoinjs-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import styles from "../../../../styles/modal.module.css"
import profile from "../../../../styles/profile.module.css";

const SetPic = ({onClose}) => {
    const setPicRef = useRef()
    const formSetPicSubmit = async (e) => {
        e.preventDefault()
        const pic = setPicRef.current.value
        if (pic && pic.length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog("Pic length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
            return
        }
        const picOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.SetPic, "hex"),
            Buffer.from(pic),
        ])
        const wallet = await GetWallet()
        const recentSetPic = await window.electron.getRecentSetPic(wallet.addresses)
        let beatHash
        if (recentSetPic && !recentSetPic.block_hash) {
            beatHash = recentSetPic.tx_hash
        }
        await CreateTransaction(wallet, [{script: picOpReturnOutput}], beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formSetPicSubmit}>
                    <label>
                        <span>Set pic:</span>
                    </label>
                    <input ref={setPicRef} type="text"/>
                    <input type="submit" value="Set"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default SetPic
