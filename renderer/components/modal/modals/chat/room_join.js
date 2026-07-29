import Modal from "../../modal";
import profile from "../../../../styles/profile.module.css"
import styles from "../../../../styles/modal.module.css"
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";

const RoomJoin = ({onClose, modalProps: {room, leave = false}, setModal}) => {
    const formJoinRoomSubmit = async (e) => {
        e.preventDefault()
        let prefix = bitcoin.Prefix.ChatFollow
        if (leave) {
            prefix = bitcoin.Prefix.ChatUnfollow
        }
        const joinRoomOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(prefix, "hex"),
            Buffer.from(room),
        ])
        const wallet = await GetWallet()
        // An unconfirmed join or leave from any of the identity's addresses is
        // what this one has to sort after, since room membership resolves across
        // the linked-address cluster. The tx is still signed by the wallet.
        const linked = await window.electron.getLinkedAddresses(
            wallet.addresses.concat(wallet.changeList || []))
        const recentFollowRoom = await window.electron.getRecentRoomFollow(linked, room)
        let beatHash
        if (recentFollowRoom && !recentFollowRoom.block_hash) {
            beatHash = recentFollowRoom.tx_hash
        }
        await CreateTransaction(wallet, [{script: joinRoomOpReturnOutput}],setModal, null, beatHash)
        const {encrypted} = await window.electron.getWalletFileInfo()
        if(!wallet.settings.DirectTx || !encrypted){
            onClose()
        }
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formJoinRoomSubmit}>
                    <label><span>Room:</span></label>
                    <input type="text" value={room} readOnly={true}/>
                    <input type="submit" value={leave ? "Leave" : "Join"}/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default RoomJoin
