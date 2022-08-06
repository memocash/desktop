import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import styles from "../../../../styles/modal.module.css"

const SetName = ({onClose, modalProps: {utxosRef}}) => {
    const setNameRef = useRef()
    const formSetNameSubmit = async (e) => {
        e.preventDefault()
        const name = setNameRef.current.value
        if (name && Buffer.from(name).length > bitcoin.MaxOpReturn) {
            window.electron.showMessageDialog("Name length is too long (max: " + bitcoin.MaxOpReturn + ")")
            return
        }
        const nameOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.SetName, "hex"),
            Buffer.from(name),
        ])
        const wallet = await GetWallet()
        const recentSetName = await window.electron.getRecentSetName(wallet.addresses)
        let beatHash
        if (recentSetName && !recentSetName.block_hash) {
            beatHash = recentSetName.tx_hash
        }
        await CreateTransaction(wallet, utxosRef.current.value, nameOpReturnOutput, 0, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <form onSubmit={formSetNameSubmit}>
                    <label>
                        <span>Set name:</span>
                        <input ref={setNameRef} type="text"/>
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

export default SetName
