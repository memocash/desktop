import profile from "../../../styles/profile.module.css";
import {TimeSince} from "../../util/time";
import Links from "../snippets/links";
import {BsCurrencyBitcoin, BsHeart} from "react-icons/bs";
import {Modals} from "../../../../main/common/util";

const Post = ({post, setModal, isSingle = false}) => {
    const clickProfile = (address) => {
        setModal(Modals.ProfileView, {address})
    }
    const openTx = async (e, txHash) => {
        e.stopPropagation()
        await window.electron.openTransaction({txHash})
    }
    const clickPostBody = () => !isSingle && setModal(Modals.Post, {txHash: post.tx_hash})
    const clickLikesLink = () => setModal(Modals.PostLikes, {txHash: post.tx_hash})
    return (
        <div className={profile.post_single}>
            <div className={profile.post}>
                <div className={profile.post_header} onClick={() => clickProfile(post.address)}>
                    <img alt={"Pic"} src={(post.pic && post.pic.length) ?
                        `data:image/png;base64,${Buffer.from(post.pic).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    {post.name}
                    {" "}
                    <span title={post.timestamp} className={profile.time} onClick={(e) => openTx(e, post.tx_hash)}>
                    {post.timestamp ? TimeSince(post.timestamp) : "Tx"}
                </span>
                </div>
                <div className={profile.post_body} onClick={clickPostBody}>
                    <Links>{post.text}</Links>
                </div>
                {isSingle ?
                    <div className={profile.post_footer}>
                        <span className={profile.like_link} onClick={clickLikesLink}>
                            {post.like_count} likes</span>
                        <span>{post.tip_total ? post.tip_total.toLocaleString() : 0} sats</span>
                        <br/>
                        <span><BsHeart/></span>
                        <span><BsCurrencyBitcoin/></span>
                    </div>
                    :
                    <div className={profile.post_footer}>
                        <span><BsHeart/> {post.like_count}</span>
                        <span><BsCurrencyBitcoin/> {post.tip_total ? post.tip_total.toLocaleString() : 0}</span>
                    </div>
                }
            </div>
        </div>
    )
}

export default Post
