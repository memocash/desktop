import styles from "../../../styles/chat.module.css";
import {BsDoorOpen} from "react-icons/bs";
import {useEffect, useState} from "react";
import {Modals} from "../../../../main/common/util";

const ContentHeader = ({isFollowingRoom, room, setModal}) => {
    const [numFollowers, setNumFollowers] = useState(0)
    useEffect(async () => {
        if (!room || !room.length) {
            setNumFollowers(0)
            return
        }
        const numFollowers = await window.electron.getChatRoomFollowCount({room})
        if (numFollowers.length) {
            setNumFollowers(numFollowers[0].count)
        }
    }, [room])
    const clickOpenJoinModal = () => setModal(Modals.ChatRoomJoin, {room})
    const clickOpenLeaveModal = () => setModal(Modals.ChatRoomJoin, {room, leave: true})
    const clickRoomFollowers = () => {
        setModal(Modals.ChatRoomFollowers, {room})
    }
    return (
        <div className={styles.content_header}>
            <div className={styles.content_header_left}>
                <h2>{room}</h2>
                {room.length ? <a onClick={clickRoomFollowers}>
                    {numFollowers} member{numFollowers === 1 ? "" : "s"}</a> : ""}
            </div>
            <div className={styles.content_header_buttons}>
                {isFollowingRoom ? (
                    <button title={"Leave Room"} onClick={clickOpenLeaveModal}>
                        <BsDoorOpen/>
                    </button>
                ) : (
                    <button title={"Join Room"} onClick={clickOpenJoinModal}>
                        <BsDoorOpen/>
                    </button>
                )}
            </div>
        </div>
    )
}

export default ContentHeader
