import {useRef, useState} from "react";
import styles from "../../styles/chat.module.css";
import {useReferredState} from "../util/state";
import {ContentBody, ContentFooter, ContentHeader, Sidebar, Update} from "./chat/index";

const Chat = ({setModal, room, setRoom}) => {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [lastUpdateFollows, setLastUpdateFollows] = useState(null);
    const [isFollowingRoom, setIsFollowingRoom] = useState(false);
    const [follows, followsRef, setFollows] = useReferredState([])
    const sidebarRef = useRef()
    const contentRef = useRef()
    const sidebarHandleRef = useRef({
        tracking: false,
        startCursorScreenX: null,
        maxWidth: 200,
        minWidth: 75,
    })
    const handleMouseDown = (e) => {
        e.preventDefault()
        e.stopPropagation()
        sidebarHandleRef.current.startWidth = sidebarRef.current.offsetWidth
        sidebarHandleRef.current.startWidthContent = contentRef.current.offsetWidth
        sidebarHandleRef.current.startCursorScreenX = e.screenX
        sidebarHandleRef.current.tracking = true
    }
    const handleMouseUp = () => {
        sidebarHandleRef.current.tracking = false
    }
    const handleMouseMove = (e) => {
        if (!sidebarHandleRef.current.tracking) {
            return
        }
        const delta = e.screenX - sidebarHandleRef.current.startCursorScreenX
        const newWidth = Math.min(Math.max(sidebarHandleRef.current.startWidth + delta,
            sidebarHandleRef.current.minWidth), sidebarHandleRef.current.maxWidth)
        sidebarRef.current.style.width = newWidth + "px"
        const newWidthContent = sidebarHandleRef.current.startWidthContent - delta +
            (sidebarHandleRef.current.startWidth + delta - newWidth)
        contentRef.current.style.width = newWidthContent + "px"
    }
    return (
        <div className={styles.wrapper} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <Update followsRef={followsRef} lastUpdateFollows={lastUpdateFollows} room={room} setFollows={setFollows}
                    setIsFollowingRoom={setIsFollowingRoom} setLastUpdate={setLastUpdate}
                    setLastUpdateFollows={setLastUpdateFollows}/>
            <Sidebar sidebarRef={sidebarRef} follows={follows} room={room} setRoom={setRoom}/>
            <div className={styles.sidebar_handle} onMouseDown={handleMouseDown}/>
            <div ref={contentRef} className={styles.content}>
                <ContentHeader isFollowingRoom={isFollowingRoom} room={room} setModal={setModal}/>
                <ContentBody lastUpdate={lastUpdate} room={room} setModal={setModal}/>
                <ContentFooter room={room} setModal={setModal} setRoom={setRoom}/>
            </div>
        </div>
    )
}

export default Chat
