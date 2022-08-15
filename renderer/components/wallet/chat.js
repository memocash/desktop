import {useEffect, useState} from "react";
import styles from "../../styles/chat.module.css";
import GetWallet from "../util/wallet";
import UpdateChat from "./update/chat";
import {TimeSince} from "../util/time";
import {Modals} from "../../../main/common/util";
import {BsChatLeft, BsCurrencyBitcoin, BsHeart, BsHeartFill, BsJournalText} from "react-icons/bs";

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
    const clickLikeLink = (txHash) => setModal(Modals.PostLike, {txHash})
    const clickReplyLink = (txHash) => setModal(Modals.PostReply, {txHash})
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
                                    {post.timestamp ? TimeSince(post.timestamp) : ""}
                                    <button title={"Like / Tip"} onClick={() => clickLikeLink(post.tx_hash)}>
                                        {post.has_liked ? <BsHeartFill color={"#d00"}/> : <BsHeart/>} {post.like_count}
                                        {" "}
                                        <BsCurrencyBitcoin/> {post.tip_total ? post.tip_total.toLocaleString() : 0}</button>
                                    <button title={"Reply"} onClick={() => clickReplyLink(post.tx_hash)}>
                                        <BsChatLeft/> {post.reply_count}</button>
                                    <button title={"View Post"} onClick={() => clickViewPost(post.tx_hash)}>
                                        <BsJournalText/></button>
                                </div>
                                <div className={styles.post_body}>{post.text}</div>
                            </div>
                        )
                    })}
                </div>
                <div className={styles.sender}>
                    <input type={"text"} placeholder={"Type a message..."}/>
                    <input type={"submit"} value={"Send"}/>
                </div>
            </div>
        </div>
    )
}

export default Chat
