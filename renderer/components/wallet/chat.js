import profile from "../../styles/profile.module.css";
import {useEffect, useState} from "react";
import UpdateChat from "./update/chat";

const Chat = () => {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [roomName, setRoomName] = useState("test");
    useEffect(async () => {
        await UpdateChat({roomName: roomName, setLastUpdate});
    }, [])
    useEffect(() => {
        const posts = window.electron.getChatPosts(roomName)
    }, [lastUpdate])
    return (
        <div className={profile.wrapper}>
            Chat rooms...
        </div>
    )
}

export default Chat
