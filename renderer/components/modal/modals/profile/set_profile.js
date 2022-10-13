import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "bitcoinjs-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import styles from "../../../../styles/modal.module.css"
import profile from "../../../../styles/profile.module.css";

const SetProfile = ({onClose}) => {
    const setProfileRef = useRef()
    const formSetProfileSubmit = async (e) => {
        e.preventDefault()
        const profile = setProfileRef.current.value
        if (profile && profile.length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog("Profile length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
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
        await CreateTransaction(wallet, [{script: profileOpReturnOutput}], beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formSetProfileSubmit}>
                    <label>
                        <span>Set profile:</span>
                    </label>
                    <input ref={setProfileRef} type="text"/>
                    <input type="submit" value="Set"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default SetProfile
