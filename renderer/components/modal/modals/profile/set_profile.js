import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import styles from "../../../../styles/modal.module.css"

const SetProfile = ({onClose, modalProps: {utxosRef}}) => {
    const setProfileRef = useRef()
    const formSetProfileSubmit = async (e) => {
        e.preventDefault()
        const profile = setProfileRef.current.value
        if (profile && profile.length > bitcoin.MaxOpReturn) {
            window.electron.showMessageDialog("Profile length is too long (max: " + bitcoin.MaxOpReturn + ")")
            return
        }
        const profileOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.SetProfile, "hex"),
            Buffer.from(profile),
        ])
        const wallet = await GetWallet()
        const recentSetProfile = await window.electron.getRecentSetProfile(wallet.addresses)
        let beatHash
        if (recentSetProfile && !recentSetProfile.block_hash) {
            beatHash = recentSetProfile.tx_hash
        }
        await CreateTransaction(wallet, utxosRef.current.value, profileOpReturnOutput, 0, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={styles.root}>
                <form onSubmit={formSetProfileSubmit}>
                    <label>
                        <span>Set profile:</span>
                        <input ref={setProfileRef} type="text"/>
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

export default SetProfile
