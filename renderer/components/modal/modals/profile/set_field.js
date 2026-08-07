import Modal from "../../modal";
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "../../../util/bitcoincash";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {useRef} from "react";
import profile from "../../../../styles/profile.module.css"
import styles from "../../../../styles/modal.module.css"

// One modal for the three profile fields - name, profile text, pic url - which
// differ only in their memo prefix, their recent-tx getter (for beating an
// unconfirmed previous set), and the label. Length is measured in bytes, the
// unit OP_RETURN space is spent in, so multi-byte characters count what they
// cost.
const SetField = ({onClose, setModal, label, prefix, getRecent}) => {
    const fieldRef = useRef()
    const submit = async (e) => {
        e.preventDefault()
        const value = fieldRef.current.value
        if (value && Buffer.from(value).length > bitcoin.Fee.MaxOpReturn) {
            window.electron.showMessageDialog(label + " length is too long (max: " + bitcoin.Fee.MaxOpReturn + ")")
            return
        }
        const opReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(prefix, "hex"),
            Buffer.from(value),
        ])
        const wallet = await GetWallet()
        const recent = await getRecent(wallet.addresses)
        let beatHash
        if (recent && !recent.block_hash) {
            beatHash = recent.tx_hash
        }
        await CreateTransaction(wallet, [{script: opReturnOutput}], setModal, null, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={submit}>
                    <label>
                        <span>Set {label.toLowerCase()}:</span>
                    </label>
                    <input ref={fieldRef} type="text"/>
                    <input type="submit" value="Set"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

const SetName = (props) => <SetField {...props} label="Name" prefix={bitcoin.Prefix.SetName}
                                     getRecent={(addresses) => window.electron.getRecentSetName(addresses)}/>

const SetProfile = (props) => <SetField {...props} label="Profile" prefix={bitcoin.Prefix.SetProfile}
                                        getRecent={(addresses) => window.electron.getRecentSetProfile(addresses)}/>

const SetPic = (props) => <SetField {...props} label="Pic" prefix={bitcoin.Prefix.SetPic}
                                    getRecent={(addresses) => window.electron.getRecentSetPic(addresses)}/>

export {SetName, SetPic, SetProfile}
