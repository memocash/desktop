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
                    <input ref={roomNameRef} type="text" aria-label={"Open a room by topic"}
                           title={"Type a topic and press Enter to open that room"}
                           placeholder={"Type a topic..."}/>
                </form>
            </div>
            <div className={styles.sidebar_content}>
                <h3 className={styles.sidebar_label}>Your rooms</h3>
                {follows.length ?
                    <ul>{follows.map((follow, i) => (
                        <li key={i} onClick={(e) => clickRoom(e, follow.room)}
                            className={room === follow.room ? styles.selected : ""}>
                            {follow.room}
                        </li>
                    ))}</ul> :
                    <p className={styles.sidebar_empty}>Rooms you join show up here.</p>}
            </div>
            <div className={styles.sidebar_footer}>
            </div>
        </div>
    )
}

export default Sidebar
