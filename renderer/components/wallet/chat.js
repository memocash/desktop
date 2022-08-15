import {useEffect, useRef, useState} from "react";
import styles from "../../styles/chat.module.css";
import GetWallet from "../util/wallet";
import {ListenChatPosts, UpdateChat} from "./update/chat";
import {TimeSince} from "../util/time";
import {Modals} from "../../../main/common/util";
import {BsChatLeft, BsCurrencyBitcoin, BsDoorOpen, BsHeart, BsHeartFill, BsJournalText} from "react-icons/bs";
import Links from "./snippets/links";
import bitcoin from "../util/bitcoin";
import {address, opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {CreateTransaction} from "./snippets/create_tx";

const Chat = ({setModal}) => {
    const [lastUpdate, setLastUpdate] = useState(null);
    const [room, setRoom] = useState("");
    const [posts, setPosts] = useState([]);
    const messageRef = useRef()
    const sidebarRef = useRef()
    const contentRef = useRef()
    const [disableMessageForm, setDisableMessageForm] = useState(true)
    const sidebarHandleRef = useRef({
        tracking: false,
        startCursorScreenX: null,
        maxWidth: 200,
        minWidth: 75,
    })
    useEffect(async () => {
        if (!room || !room.length) {
            setDisableMessageForm(true)
            return
        }
        setDisableMessageForm(false)
        await UpdateChat({roomName: room, setLastUpdate});
        ListenChatPosts({names: [room], setLastUpdate})
    }, [room])
    useEffect(async () => {
        const userAddresses = (await GetWallet()).addresses
        const posts = await window.electron.getChatPosts({room, userAddresses})
        setPosts(posts)
    }, [lastUpdate, room])
    const clickViewProfile = (address) => setModal(Modals.ProfileView, {address})
    const clickViewPost = (txHash) => setModal(Modals.Post, {txHash})
    const clickLikeLink = (txHash) => setModal(Modals.PostLike, {txHash})
    const clickReplyLink = (txHash) => setModal(Modals.PostReply, {txHash})
    const formSubmitHandler = async (e) => {
        e.preventDefault()
        const message = messageRef.current.value
        const maxMessageSize = bitcoin.Fee.MaxOpReturn - bitcoin.Fee.OpPushDataBase - Buffer.from(room).length
        if (!message || !message.length) {
            return
        } else if (Buffer.from(message).length > maxMessageSize) {
            window.electron.showMessageDialog("Message too long (max length: " + maxMessageSize + ")")
            return
        }
        const chatPostOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.ChatPost, "hex"),
            Buffer.from(room),
            Buffer.from(message),
        ])
        await CreateTransaction(await GetWallet(), [{script: chatPostOpReturnOutput}])
        messageRef.current.value = ""
    }
    const formClickHandler = () => {
        if (!disableMessageForm) {
            return
        }
        clickOpenRoomModal()
    }
    const handleMouseDown = (e) => {
        e.preventDefault()
        e.stopPropagation()
        sidebarHandleRef.current.startWidth = sidebarRef.current.offsetWidth
        sidebarHandleRef.current.startWidthContent = contentRef.current.offsetWidth
        sidebarHandleRef.current.startCursorScreenX = e.screenX
        sidebarHandleRef.current.tracking = true
    }
    const handleMouseUp = (e) => {
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
    const clickOpenRoomModal = () => setModal(Modals.ChatRoomLoad, {setRoom})
    return (
        <div className={styles.wrapper} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            <div ref={sidebarRef} className={styles.sidebar}>
                <div className={styles.sidebar_header}>
                    <h2>{room}</h2>
                </div>
                <div className={styles.sidebar_content}>
                    <button title={"Open Room"} onClick={clickOpenRoomModal}>
                        <BsDoorOpen/>
                    </button>
                </div>
            </div>
            <div className={styles.sidebar_handle} onMouseDown={handleMouseDown}/>
            <div ref={contentRef} className={styles.content}>
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
                                        {post.timestamp ? TimeSince(post.timestamp) : ""}</span>
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
                <form className={styles.sender} onSubmit={formSubmitHandler} onClick={formClickHandler}>
                    <fieldset disabled={disableMessageForm}>
                        <input ref={messageRef} type={"text"} placeholder={"Type a message..."}/>
                        <input type={"submit"} value={"Send"}/>
                    </fieldset>
                </form>
            </div>
        </div>
    )
}

export default Chat
