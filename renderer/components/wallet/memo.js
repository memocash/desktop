import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsFiles, BsFire, BsGlobe, BsPencil, BsPencilSquare, BsPeople, BsPerson} from "react-icons/bs";
import FollowList from "./memo/follow_list";
import {Modals} from "../../../main/common/util";
import PostList from "./memo/post_list";
import NewPostList from "./memo/new_post_list";

const Tabs = {
    Posts: "posts",
    Feed: "feed",
    Ranked: "ranked",
    Following: "following",
}

const Memo = ({lastUpdate, setModal, setChatRoom}) => {
    const [tab, setTab] = useState(Tabs.Posts)
    const [picData, setPicData] = useState(undefined)
    const [profileInfo, setProfileInfo] = useState({
        address: "",
        name: "",
        profile: "",
        pic: "",
    })
    const [walletAddresses, setWalletAddresses] = useState([])
    const utxosRef = useRef([])
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        // Expand to the wallet's linked-address cluster (already synced to the
        // local db by the update flow) so the self profile shows name/posts/
        // follows from linked accounts too. Wallet addresses stay first so the
        // wallet's own name/profile/pic win the merge. Utxos below stay
        // wallet-only - linked addresses' funds aren't spendable here.
        const linked = await window.electron.getLinkedAddresses(
            wallet.addresses.concat(wallet.changeList || []))
        setWalletAddresses(linked)
        const profileInfo = await window.electron.getProfileInfo(linked)
        if (profileInfo !== undefined) {
            setProfileInfo(profileInfo)
            if (profileInfo.pic !== undefined) {
                const picData = await window.electron.getPic(profileInfo.pic)
                setPicData(picData)
            }
        }
        utxosRef.current.value = await window.electron.getUtxos(wallet.addresses)
        utxosRef.current.value.sort((a, b) => {
            return b.value - a.value
        })
    })()}, [lastUpdate])
    const clickEditName = () => setModal(Modals.ProfileSetName, {utxosRef})
    const clickEditProfile = () => setModal(Modals.ProfileSetText, {utxosRef})
    const clickEditPic = () => setModal(Modals.ProfileSetPic, {utxosRef})
    const setProfile = (address) => setModal(Modals.ProfileView, {address, utxosRef, lastUpdate})
    const createPost = () => setModal(Modals.PostCreate, {utxosRef})
    return (
        <div className={profile.wrapper}>
            <div className={profile.header}>
                <div className={profile.pic} onClick={clickEditPic}>
                    <img alt={"Profile image"} className={profile.img} src={picData ?
                        `data:image/png;base64,${Buffer.from(picData).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    <a className={profile.editLink}><BsPencil/></a>
                </div>
                <div className={profile.summary}>
                    <h2 onClick={clickEditName}>
                        {profileInfo.name ? profileInfo.name : "Name not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </h2>
                    <p className={profile.text} onClick={clickEditProfile}>
                        {profileInfo.profile ? profileInfo.profile : "Profile not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </p>
                    <div className={profile.profile_actions} role={"toolbar"}
                         aria-label={"Profile views and actions"}>
                        <button title={"View Newest Posts"} className={tab === Tabs.Posts ? profile.selected : null}
                                aria-pressed={tab === Tabs.Posts} onClick={() => setTab(Tabs.Posts)}>
                            <BsFiles/> Posts</button>
                        <button title={"View Feed (All Users)"} className={tab === Tabs.Feed ? profile.selected : null}
                                aria-pressed={tab === Tabs.Feed} onClick={() => setTab(Tabs.Feed)}>
                            <BsGlobe/> Global feed</button>
                        <button title={"View Ranked Feed (Likes / Replies / Recency)"}
                                className={tab === Tabs.Ranked ? profile.selected : null}
                                aria-pressed={tab === Tabs.Ranked} onClick={() => setTab(Tabs.Ranked)}>
                            <BsFire/> Popular</button>
                        <button title={"View Following"} className={tab === Tabs.Following ? profile.selected : null}
                                aria-pressed={tab === Tabs.Following} onClick={() => setTab(Tabs.Following)}>
                            <BsPeople/> Following</button>
                        <button title={"View Profile"} onClick={() => setProfile(profileInfo.address)}>
                            <BsPerson/> View profile</button>
                        <button className={profile.primary_action} title={"Create New Post"} onClick={() => createPost()}>
                            <BsPencilSquare/> New post</button>
                    </div>
                </div>
            </div>
            {tab === Tabs.Posts ?
                <PostList setModal={setModal} lastUpdate={lastUpdate} addresses={walletAddresses}/> : null}
            {tab === Tabs.Feed ?
                <NewPostList setModal={setModal} setChatRoom={setChatRoom} lastUpdate={lastUpdate}/> : null}
            {tab === Tabs.Ranked ?
                <NewPostList setModal={setModal} setChatRoom={setChatRoom} lastUpdate={lastUpdate} ranked/> : null}
            {tab === Tabs.Following ? <FollowList addresses={walletAddresses} setModal={setModal}/> : null}
        </div>
    )
}

export default Memo
