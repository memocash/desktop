import Modal from "../../modal/modal";
import bitcoin from "../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../util/wallet";
import {CreateTransaction} from "../snippets/create_tx";
import {useRef} from "react";
import seed from "../../modal/seed.module.css";

const SetName = ({onClose, utxosRef}) => {
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
            <div className={seed.root}>
                <form onSubmit={formSetPicSubmit}>
                    <label>
                        <span>Set pic:</span>
                        <input ref={setPicRef} type="text"/>
                    </label>
                    <input type="submit" value="Set"/>
                </form>
            </div>
        </Modal>
    )
}

export default SetName
