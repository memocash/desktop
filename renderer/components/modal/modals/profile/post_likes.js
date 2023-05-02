import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util";
import profile from "../../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import styles from "../../../../styles/modal.module.css";
import Post from "../../../wallet/memo/post";
import {TitleCol} from "../../../wallet/snippets/title_col";
import {useReferredState} from "../../../util/state";
import {TimeSince} from "../../../util/time";
import {BsBoxArrowInUpRight} from "react-icons/bs";

const Column = {
    Name: "name",
    Tip: "tip",
    Timestamp: "timestamp",
}

const PostLikes = ({basic: {setModal, onClose, setChatRoom}, modalProps: {txHash}}) => {
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Timestamp)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const [likes, likesRef, setLikes] = useReferredState([])
    const [post, setPost] = useState({})
    useEffect(() => {(async () => {
        const likes = await window.electron.getLikes(txHash)
        setLikes(likes)
        const {addresses} = await window.electron.getWallet()
        const post = await window.electron.getPost({txHash, userAddresses: addresses})
        setPost(post)
    })()}, [txHash])
    const sortLikes = (field) => {
        let desc = sortDescRef.current
        if (sortColRef.current === field) {
            desc = !desc
        } else {
            desc = true
        }
        if (desc) {
            likesRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            likesRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setLikes([...likesRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    const setProfile = (address) => setModal(Modals.ProfileView, {address})
    const openTx = async (txHash) => await window.electron.openTransaction({txHash})
    return (
        <Modal onClose={onClose}>
            <Post post={post} setModal={setModal} isSingle={true} setChatRoom={setChatRoom}/>
            {likes.length ? <div className={profile.likes_list}>
                <div className={profile.row}>
                    <TitleCol sortFunc={sortLikes} desc={sortDesc} sortCol={sortCol} col={Column.Name} title={"Name"}/>
                    <TitleCol sortFunc={sortLikes} desc={sortDesc} sortCol={sortCol} col={Column.Tip} title={"Tip"}/>
                    <TitleCol sortFunc={sortLikes} desc={sortDesc} sortCol={sortCol} col={Column.Timestamp}
                              title={"Timestamp"}/>
                </div>
                {likes.map((like, i) => {
                    return (
                        <div key={i} className={profile.row}>
                            <div className={profile.imgWrapper} onClick={() => setProfile(like.address)}>
                                <img alt={"Pic"} className={profile.img} src={(like.pic_data && like.pic_data.length) ?
                                    `data:image/png;base64,${Buffer.from(like.pic_data).toString("base64")}` :
                                    "/default-profile.jpg"}/>
                                {like.name}
                            </div>
                            <div>{like.tip ? like.tip.toLocaleString() : 0}</div>
                            <div>
                                {TimeSince(like.timestamp)}
                                <button onClick={() => openTx(like.like_tx_hash)}><BsBoxArrowInUpRight/> Tx</button>
                            </div>
                        </div>
                    )
                })}
            </div> : <div className={profile.no_results}>No likes</div>}
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default PostLikes
