import styles from "../../../styles/chat.module.css";
import {useEffect, useRef} from "react";

const Sidebar = ({sidebarRef, follows, room, setRoom}) => {
    const roomNameRef = useRef()
    useEffect(() => {
        roomNameRef.current.value = ""
    }, [room])
    const clickRoom = (e, room) => {
        e.stopPropagation()
        setRoom(room)
    }
    const formLoadRoomSubmit = async (e) => {
        e.preventDefault()
        const name = roomNameRef.current.value
        setRoom(name)
    }
    return (
        <div ref={sidebarRef} className={styles.sidebar}>
            <div className={styles.sidebar_header}>
                <form onSubmit={formLoadRoomSubmit}>
                    <input ref={roomNameRef} type="text" placeholder={"Room"}/>
                </form>
            </div>
            <div className={styles.sidebar_content}>
                <ul>{follows.map((follow, i) => (
                    <li key={i} onClick={(e) => clickRoom(e, follow.room)}
                        className={room === follow.room ? styles.selected : ""}>
                        {follow.room}
                    </li>
                ))}</ul>
            </div>
            <div className={styles.sidebar_footer}>
            </div>
        </div>
    )
}

export default Sidebar
