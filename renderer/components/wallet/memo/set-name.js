import Modal from "../../modal/modal";
import bitcoin from "../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "../snippets/create_tx";
import {useRef} from "react";
import seed from "../../modal/seed.module.css";

const SetName = ({onClose, utxosRef}) => {
    const setNameRef = useRef()
    const formSetNameSubmit = async (e) => {
        e.preventDefault()
        const name = setNameRef.current.value
        if (name && name.length > bitcoin.MaxOpReturn) {
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
            <div className={seed.root}>
                <form onSubmit={formSetNameSubmit}>
                    <label>
                        <span>Set name:</span>
                        <input ref={setNameRef} type="text"/>
                    </label>
                    <input type="submit" value="Set"/>
                </form>
            </div>
        </Modal>
    )
}

export default SetName
