import profile from "../../../styles/profile.module.css";
import {TimeSince} from "../../util/time";
import Links from "../snippets/links";
import {
    BsBoxArrowInUpRight, BsChatLeft, BsCurrencyBitcoin, BsHeart, BsHeartFill, BsJournalText, BsListCheck, BsPerson,
    BsThreeDots
} from "../../util/icons";
import {Modals} from "../../../../main/common/util";
import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";

const Post = ({post, setModal, setChatRoom, isSingle = false, isFeedRow = false}) => {
    const [counter, setCounter] = useState(0)
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuPos, setMenuPos] = useState({})
    const menuRef = useRef()
    const menuButtonRef = useRef()
    useEffect(() => {
        const interval = setInterval(() => {
            setCounter((prevCounter) => prevCounter + 1);
        }, 10000);
        return () => clearInterval(interval);
    }, [])
    useEffect(() => {
        if (!menuOpen) {
            return
        }
        // The menu lives in the body, so the toggle button has to be checked
        // separately or pressing it again would close and immediately reopen.
        const dismiss = (e) => {
            const inMenu = menuRef.current && menuRef.current.contains(e.target)
            const onButton = menuButtonRef.current && menuButtonRef.current.contains(e.target)
            if (!inMenu && !onButton) {
                setMenuOpen(false)
            }
        }
        const keyDown = (e) => {
            if (e.key === "Escape") {
                setMenuOpen(false)
            }
        }
        window.addEventListener("mousedown", dismiss)
        window.addEventListener("keydown", keyDown)
        return () => {
            window.removeEventListener("mousedown", dismiss)
            window.removeEventListener("keydown", keyDown)
        }
    }, [menuOpen])
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
    // The post lists scroll, so the menu is positioned in viewport coordinates
    // instead of inside the row, where it would be clipped by the list. It is
    // also rendered into the body: a modal ancestor carries a transform, which
    // would otherwise become the containing block for the fixed menu and shift
    // it away from the button.
    const MenuHeight = 110
    const MenuWidth = 150
    const toggleMenu = (e) => {
        e.stopPropagation()
        if (menuOpen) {
            setMenuOpen(false)
            return
        }
        const rect = menuButtonRef.current.getBoundingClientRect()
        const below = window.innerHeight - rect.bottom > MenuHeight
        setMenuPos({
            left: Math.min(rect.left, window.innerWidth - MenuWidth - 5),
            top: below ? rect.bottom + 2 : undefined,
            bottom: below ? undefined : window.innerHeight - rect.top + 2,
        })
        setMenuOpen(true)
    }
    const runMenuAction = (e, action) => {
        e.stopPropagation()
        setMenuOpen(false)
        action(e)
    }
    // In a list the whole row opens the post, so the secondary actions can live
    // behind the overflow menu instead of adding a button each to every row.
    const clickRow = (e) => {
        if (isSingle || !isFeedRow) {
            return
        }
        if (e.target.closest("a, button, input, textarea")) {
            return
        }
        clickViewPost()
    }
    return (
        <div className={isSingle ? profile.post_single : isFeedRow ? profile.feed_post_row : null}
             onClick={clickRow}>
            <div className={profile.post}>
                <div className={profile.post_header}>
                    <img alt={"Pic"} onClick={clickViewProfile} src={(post.pic && post.pic.length) ?
                        `data:image/png;base64,${Buffer.from(post.pic).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    <span className={profile.profile_link} onClick={clickViewProfile}>{post.name}</span>
                    {post.alias && post.alias !== post.name ?
                        <span className={profile.time}> ({post.alias})</span> : null}
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
                    <button className={profile.action} title={"Like / Tip"} onClick={clickLikeLink}>
                        {post.has_liked ? <BsHeartFill color={"#d00"}/> : <BsHeart/>} {post.like_count || 0}
                        {post.tip_total ? <>
                            {" "}<BsCurrencyBitcoin/> {post.tip_total.toLocaleString()}</> : null}
                    </button>
                    <button className={profile.action} title={"Reply"} onClick={clickReplyLink}>
                        <BsChatLeft/> {post.reply_count || 0}</button>
                    <div className={profile.overflow} ref={menuRef}>
                        <button className={profile.action} title={"More actions"} aria-haspopup={"menu"}
                                aria-expanded={menuOpen} ref={menuButtonRef} onClick={toggleMenu}>
                            <BsThreeDots/></button>
                        {menuOpen ? createPortal(
                            <div className={profile.overflow_menu} role={"menu"} style={menuPos} ref={menuRef}>
                                <button role={"menuitem"} onClick={(e) => runMenuAction(e, clickViewPost)}>
                                    <BsJournalText/> View post</button>
                                <button role={"menuitem"} onClick={(e) => runMenuAction(e, clickLikesLink)}>
                                    <BsListCheck/> Likes</button>
                                <button role={"menuitem"} onClick={(e) => runMenuAction(e, clickViewProfile)}>
                                    <BsPerson/> Profile</button>
                                <button role={"menuitem"}
                                        onClick={(e) => runMenuAction(e, (e) => openTx(e, post.tx_hash))}>
                                    <BsBoxArrowInUpRight/> Transaction</button>
                            </div>, document.body) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Post
