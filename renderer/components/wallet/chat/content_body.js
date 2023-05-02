import styles from "../../../styles/chat.module.css";
import {TimeSince} from "../../util/time";
import {BsChatLeft, BsCurrencyBitcoin, BsHeart, BsHeartFill, BsJournalText} from "react-icons/bs";
import Links from "../snippets/links";
import {Modals} from "../../../../main/common/util";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {ListenPosts} from "../update/index";

const ContentBody = ({lastUpdate, room, setModal}) => {
    const [counter, setCounter] = useState(0)
    const [posts, setPosts] = useState([])
    const [txHashes, setTxHashes] = useState([])
    const [lastUpdatePosts, setLastUpdatePosts] = useState(null)
    useEffect(() => {
        const interval = setInterval(() => {
            setCounter((prevCounter) => prevCounter + 1);
        }, 10000);
        return () => clearInterval(interval);
    }, [])
    useEffect(() => {(async () => {
        const userAddresses = (await GetWallet()).addresses
        const posts = await window.electron.getChatPosts({room, userAddresses})
        setPosts(posts)
        let txHashes = []
        for (let i = 0; i < posts.length; i++) {
            txHashes.push(posts[i].tx_hash)
        }
        setTxHashes(txHashes)
    })()}, [lastUpdate, lastUpdatePosts, room])
    useEffect(() => {
        if (!txHashes || !txHashes.length) {
            return
        }
        const closeSocket = ListenPosts({txHashes, setLastUpdate: setLastUpdatePosts})
        return () => closeSocket()
    }, [txHashes])
    const clickViewProfile = (address) => setModal(Modals.ProfileView, {address})
    const clickViewPost = (txHash) => setModal(Modals.Post, {txHash})
    const clickLikeLink = (txHash) => setModal(Modals.PostLike, {txHash})
    const clickReplyLink = (txHash) => setModal(Modals.PostReply, {txHash})
    return (
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
                            <span className={styles.time}>
                                        {post.timestamp ? TimeSince(post.timestamp, counter) : ""}</span>
                            <button title={"Like / Tip"} onClick={() => clickLikeLink(post.tx_hash)}>
                                {post.has_liked ? <BsHeartFill color={"#d00"}/> : <BsHeart/>} {post.like_count}
                                {" "}
                                <BsCurrencyBitcoin/> {post.tip_total ? post.tip_total.toLocaleString() : 0}
                            </button>
                            <button title={"Reply"} onClick={() => clickReplyLink(post.tx_hash)}>
                                <BsChatLeft/> {post.reply_count}</button>
                            <button title={"View Post"} onClick={() => clickViewPost(post.tx_hash)}>
                                <BsJournalText/></button>
                        </div>
                        <div className={styles.post_body}>
                            <Links>{post.text}</Links>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export default ContentBody
