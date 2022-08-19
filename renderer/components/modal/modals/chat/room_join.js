import Modal from "../../modal";
import profile from "../../../../styles/profile.module.css"
import styles from "../../../../styles/modal.module.css"
import bitcoin from "../../../util/bitcoin";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";

const RoomJoin = ({onClose, modalProps: {room}}) => {
    const formJoinRoomSubmit = async (e) => {
        e.preventDefault()
        const joinRoomOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ChatFollow, "hex"),
            Buffer.from(room),
        ])
        const wallet = await GetWallet()
        const recentFollowRoom = await window.electron.getRecentRoomFollow(wallet.addresses, room)
        let beatHash
        if (recentFollowRoom && !recentFollowRoom.block_hash) {
            beatHash = recentFollowRoom.tx_hash
        }
        await CreateTransaction(wallet, [{script: joinRoomOpReturnOutput}], beatHash)
        onClose()
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formJoinRoomSubmit}>
                    <label>
                        <span>Room name:</span>
                    </label>
                    <input type="text" value={room} readOnly={true}/>
                    <input type="submit" value="Join"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default RoomJoin
