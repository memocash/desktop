import profile from "../../styles/profile.module.css";
import {useEffect, useState} from "react";
import UpdateChat from "./update/chat";
import GetWallet from "../util/wallet";

const Chat = () => {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [room, setRoom] = useState("test");
    const [posts, setPosts] = useState([]);
    useEffect(async () => {
        await UpdateChat({roomName: room, setLastUpdate});
    }, [])
    useEffect(async () => {
        const userAddresses = (await GetWallet()).addresses
        const posts = await window.electron.getChatPosts({room, userAddresses})
        setPosts(posts)
    }, [lastUpdate])
    return (
        <div className={profile.wrapper}>
            <h4>Chat room: <i>{room}</i></h4>
            {posts.map((post, index) => {
                return (
                    <div key={index}>
                        <div>{post.tx_hash}</div>
                        <div>{post.text}</div>
                    </div>
                )
            })}
        </div>
    )
}

export default Chat
