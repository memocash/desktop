import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import styles from "../../../../styles/modal.module.css"

const SetPic = ({onClose, modalProps: {utxosRef}}) => {
    const setPicRef = useRef()
    const formSetPicSubmit = async (e) => {
        e.preventDefault()
        const pic = setPicRef.current.value
        if (pic && pic.length > bitcoin.MaxOpReturn) {
            window.electron.showMessageDialog("Pic length is too long (max: " + bitcoin.MaxOpReturn + ")")
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
        await CreateTransaction(wallet, utxosRef.current.value, picOpReturnOutput, 0, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <form onSubmit={formSetPicSubmit}>
                    <label>
                        <span>Set pic:</span>
                        <input ref={setPicRef} type="text"/>
                    </label>
                    <div className={styles.buttons}>
                        <input type="submit" value="Set"/>
                        <button onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </Modal>
    )
}

export default SetPic
