import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import profile from "../../../../styles/profile.module.css"
import styles from "../../../../styles/modal.module.css"

const SetName = ({onClose}) => {
    const setNameRef = useRef()
    const formSetNameSubmit = async (e) => {
        e.preventDefault()
        const name = setNameRef.current.value
        if (name && Buffer.from(name).length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog("Name length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
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
        await CreateTransaction(wallet, [{script: nameOpReturnOutput}], beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formSetNameSubmit}>
                    <label>
                        <span>Set name:</span>
                    </label>
                    <input ref={setNameRef} type="text"/>
                    <input type="submit" value="Set"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default SetName
