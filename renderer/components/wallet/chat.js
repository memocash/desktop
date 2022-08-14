import profile from "../../styles/profile.module.css";
import {useEffect, useState} from "react";
import UpdateChat from "./update/chat";

const Chat = () => {
    const [lastUpdate, setLastUpdate] = useState(null);
    useEffect(async () => {
        await UpdateChat({roomName: "test", setLastUpdate});
    }, [])
    useEffect(() => {
        // Load chat data from SQLite database
    }, [lastUpdate])
    return (
        <div className={profile.wrapper}>
            Chat rooms...
        </div>
    )
}

export default Chat
