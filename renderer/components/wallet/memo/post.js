import profile from "../../../styles/profile.module.css";
import {TimeSince} from "../../util/time";
import Links from "../snippets/links";
import {BsBoxArrowInUpRight, BsCurrencyBitcoin, BsHeart} from "react-icons/bs";
import {Modals} from "../../../../main/common/util";

const Post = ({post, setModal, isSingle = false}) => {
    const openTx = async (e, txHash) => {
        e.stopPropagation()
        await window.electron.openTransaction({txHash})
    }
    const clickLikesLink = () => setModal(Modals.PostLikes, {txHash: post.tx_hash})
    return (
        <div className={profile.post_single}>
            <div className={profile.post}>
                <div className={profile.post_header}>
                    <img alt={"Pic"} src={(post.pic && post.pic.length) ?
                        `data:image/png;base64,${Buffer.from(post.pic).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    {post.name}
                    {" "}
                    <span title={post.timestamp} className={profile.time}>
                        {post.timestamp ? TimeSince(post.timestamp) : "Tx"}
                    </span>
                </div>
                <div className={profile.post_body}>
                    <Links>{post.text}</Links>
                </div>
                <div className={profile.post_footer}>
                    <span><BsHeart/> {post.like_count}</span>
                    <span><BsCurrencyBitcoin/> {post.tip_total ? post.tip_total.toLocaleString() : 0}</span>
                    <button onClick={() => setModal(Modals.ProfileView, {address: post.address})}>Profile</button>
                    <button onClick={() => setModal(Modals.Post, {txHash: post.tx_hash})}>Post</button>
                    <button onClick={clickLikesLink}>Likes</button>
                    <button onClick={(e) => openTx(e, post.tx_hash)}><BsBoxArrowInUpRight/> Tx</button>
                </div>
            </div>
        </div>
    )
}

export default Post
