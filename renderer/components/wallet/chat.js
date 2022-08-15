import {useEffect, useState} from "react";
import styles from "../../styles/chat.module.css";
import GetWallet from "../util/wallet";
import UpdateChat from "./update/chat";
import {TimeSince} from "../util/time";
import {Modals} from "../../../main/common/util";

const Chat = ({setModal}) => {
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
    const clickViewProfile = (address) => setModal(Modals.ProfileView, {address})
    const clickViewPost = (txHash) => setModal(Modals.Post, {txHash})
    return (
        <div className={styles.wrapper}>
            <div className={styles.sidebar}>
                <div className={styles.sidebar_header}>
                    <h2>{room}</h2>
                </div>
            </div>
            <div className={styles.content}>
                <div className={styles.posts}>
                    {posts.map((post, index) => {
                        return (
                            <div key={index} className={styles.post}>
                                <div className={styles.post_header}>
                                    <a onClick={() => clickViewProfile(post.address)}>
                                        <img alt={"Pic"} src={(post.pic && post.pic.length) ?
                                            `data:image/png;base64,${Buffer.from(post.pic).toString("base64")}` :
                                            "/default-profile.jpg"}/>
                                        {post.name}
                                    </a>
                                    {" "}
                                    <a title={post.timestamp} className={styles.time}
                                       onClick={() => clickViewPost(post.tx_hash)}>
                                        {post.timestamp ? TimeSince(post.timestamp) : "Tx"}
                                    </a>
                                </div>
                                <div className={styles.post_body}>{post.text}</div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default Chat
