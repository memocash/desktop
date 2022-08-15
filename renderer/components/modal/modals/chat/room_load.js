import Modal from "../../modal";
import {useRef} from "react";
import profile from "../../../../styles/profile.module.css"
import styles from "../../../../styles/modal.module.css"

const RoomLoad = ({onClose, modalProps: {setRoom}}) => {
    const roomNameRef = useRef()
    const formLoadRoomSubmit = async (e) => {
        e.preventDefault()
        const name = roomNameRef.current.value
        setRoom(name)
        onClose()
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.set_profile}>
                <form onSubmit={formLoadRoomSubmit}>
                    <label>
                        <span>Room name:</span>
                    </label>
                    <input ref={roomNameRef} type="text"/>
                    <input type="submit" value="Open"/>
                </form>
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Cancel</button>
            </div>
        </Modal>
    )
}

export default RoomLoad
