import profile from "../../../styles/profile.module.css";
import {TimeSince} from "../../util/time";
import Links from "../snippets/links";
import {
    BsBoxArrowInUpRight, BsChatLeft, BsCurrencyBitcoin, BsHeart, BsHeartFill, BsJournalText, BsListCheck, BsPerson
} from "react-icons/bs";
import {Modals} from "../../../../main/common/util";
import {useEffect, useState} from "react";

const Post = ({post, setModal, setChatRoom, isSingle = false}) => {
    const [counter, setCounter] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => {
            setCounter((prevCounter) => prevCounter + 1);
        }, 10000);
        return () => clearInterval(interval);
    }, [])
    const openTx = async (e, txHash) => {
        e.stopPropagation()
        await window.electron.openTransaction({txHash})
    }
    const clickLikeLink = () => setModal(Modals.PostLike, {txHash: post.tx_hash})
    const clickLikesLink = () => setModal(Modals.PostLikes, {txHash: post.tx_hash})
    const clickReplyLink = () => setModal(Modals.PostReply, {txHash: post.tx_hash})
    const clickViewPost = () => setModal(Modals.Post, {txHash: post.tx_hash})
    const clickViewProfile = () => setModal(Modals.ProfileView, {address: post.address})
    const clickChatRoom = (room) => {
        setChatRoom(room)
        setModal(Modals.None)
    }
    return (
        <div className={isSingle ? profile.post_single : null}>
            <div className={profile.post}>
                <div className={profile.post_header}>
                    <img alt={"Pic"} src={(post.pic && post.pic.length) ?
                        `data:image/png;base64,${Buffer.from(post.pic).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    {post.name}
                    {" "}
                    <span title={post.timestamp} className={profile.time}>
                        {post.timestamp ? TimeSince(post.timestamp, counter) : "Tx"}
                    </span>
                    {post.room && post.room.length ? (
                        <a className={profile.room_link} onClick={() => clickChatRoom(post.room)}>{post.room}</a>
                    ) : ""}
                </div>
                <div className={profile.post_body}>
                    <Links>{post.text}</Links>
                </div>
                <div className={profile.post_footer}>
                    <button title={"Like / Tip"} onClick={clickLikeLink}>
                        {post.has_liked ? <BsHeartFill color={"#d00"}/> : <BsHeart/>} {post.like_count}
                        {" "}
                        <BsCurrencyBitcoin/> {post.tip_total ? post.tip_total.toLocaleString() : 0}</button>
                    <button title={"Reply"} onClick={clickReplyLink}>
                        <BsChatLeft/> {post.reply_count}</button>
                    <button title={"View Post"} onClick={clickViewPost}>
                        <BsJournalText/></button>
                    <button title={"Likes List"} onClick={clickLikesLink}><BsListCheck/></button>
                    <button title={"View Profile"} onClick={clickViewProfile}>
                        <BsPerson/></button>
                    <button title={"View Transaction"} onClick={(e) => openTx(e, post.tx_hash)}>
                        <BsBoxArrowInUpRight/></button>
                </div>
            </div>
        </div>
    )
}

export default Post
