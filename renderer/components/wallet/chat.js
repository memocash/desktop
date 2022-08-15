import {useEffect, useState} from "react";
import styles from "../../styles/chat.module.css";
import GetWallet from "../util/wallet";
import UpdateChat from "./update/chat";

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
        posts.reverse()
        setPosts(posts)
    }, [lastUpdate])
    return (
        <div className={styles.wrapper}>
            <div className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <h2>{room}</h2>
                </div>
            </div>
            <div className={styles.content}>
                <div className={styles.posts}>
                    {posts.map((post, index) => {
                        return (
                            <div key={index} className={styles.post}>
                                <div>{post.tx_hash}</div>
                                <div>{post.text}</div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default Chat
