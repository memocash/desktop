import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsFiles, BsFire, BsGlobe, BsPencil, BsPencilSquare, BsPeople, BsPerson} from "../util/icons";
import FollowList from "./memo/follow_list";
import {Modals} from "../../../main/common/util";
import NewPostList from "./memo/new_post_list";
import FeedPostList from "./memo/feed_post_list";

const Tabs = {
    Feed: "feed",
    Ranked: "ranked",
    Global: "global",
    Following: "following",
}

const Memo = ({lastUpdate, setModal, setChatRoom, initialSync}) => {
    const [tab, setTab] = useState(Tabs.Feed)
    // Once the user picks a tab themselves the default below stops applying, so
    // a late-arriving follow lookup can't pull them off the tab they chose.
    const tabPickedRef = useRef(false)
    const selectTab = (next) => {
        tabPickedRef.current = true
        setTab(next)
    }
    const [picData, setPicData] = useState(undefined)
    const [profileInfo, setProfileInfo] = useState({
        address: "",
        name: "",
        profile: "",
        pic: "",
    })
    const [walletAddresses, setWalletAddresses] = useState([])
    // Whether the feed came back with nothing: null whenever that has no answer
    // yet, which FeedPostList is careful to include every moment it has work in
    // flight. Acting on anything less would move the user off a feed that was
    // about to fill in.
    const [feedEmpty, setFeedEmpty] = useState(null)
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
    // A new account has nothing in its Feed - it follows nobody, or the people
    // it follows haven't posted - so start it on Popular, where the best of what
    // Memo has is already waiting. The Feed reports what it resolved to rather
    // than this asking again: it expands followed identities to their linked
    // addresses, so its post list is the only thing that answers "is the feed
    // empty" the same way the screen does. Waiting for the initial sync on top
    // of that keeps an existing wallet's follows from looking empty just
    // because they haven't been downloaded yet.
    useEffect(() => {
        if (initialSync || tabPickedRef.current || feedEmpty !== true) {
            return
        }
        setTab(Tabs.Ranked)
    }, [initialSync, feedEmpty])
    const clickEditName = () => setModal(Modals.ProfileSetName, {utxosRef})
    const clickEditProfile = () => setModal(Modals.ProfileSetText, {utxosRef})
    const clickEditPic = () => setModal(Modals.ProfileSetPic, {utxosRef})
    const setProfile = (address) => setModal(Modals.ProfileView, {address, utxosRef, lastUpdate})
    const createPost = () => setModal(Modals.PostCreate, {utxosRef})
    return (
        <div className={profile.wrapper}>
            <div className={profile.header}>
                <div className={profile.pic} onClick={clickEditPic}>
                    <img alt={"Profile image"} className={profile.img} src={(picData && picData.length) ?
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
                        <button title={"View posts from people you follow"}
                                className={tab === Tabs.Feed ? profile.selected : null}
                                aria-pressed={tab === Tabs.Feed} onClick={() => selectTab(Tabs.Feed)}>
                            <BsFiles/> Feed</button>
                        <button title={"View Ranked Feed (Likes / Replies / Recency)"}
                                className={tab === Tabs.Ranked ? profile.selected : null}
                                aria-pressed={tab === Tabs.Ranked} onClick={() => selectTab(Tabs.Ranked)}>
                            <BsFire/> Popular</button>
                        <button title={"View Feed (All Users)"} className={tab === Tabs.Global ? profile.selected : null}
                                aria-pressed={tab === Tabs.Global} onClick={() => selectTab(Tabs.Global)}>
                            <BsGlobe/> Global feed</button>
                        <button title={"View Following"} className={tab === Tabs.Following ? profile.selected : null}
                                aria-pressed={tab === Tabs.Following} onClick={() => selectTab(Tabs.Following)}>
                            <BsPeople/> Following</button>
                        <button title={"View Profile"} onClick={() => setProfile(profileInfo.address)}>
                            <BsPerson/> View profile</button>
                        <button className={profile.primary_action} title={"Create New Post"} onClick={() => createPost()}>
                            <BsPencilSquare/> New post</button>
                    </div>
                </div>
            </div>
            {tab === Tabs.Feed ?
                <FeedPostList setModal={setModal} setChatRoom={setChatRoom} lastUpdate={lastUpdate}
                              addresses={walletAddresses} onEmptyState={setFeedEmpty}/> : null}
            {tab === Tabs.Ranked ?
                <NewPostList setModal={setModal} setChatRoom={setChatRoom} lastUpdate={lastUpdate} ranked/> : null}
            {tab === Tabs.Global ?
                <NewPostList setModal={setModal} setChatRoom={setChatRoom} lastUpdate={lastUpdate}/> : null}
            {tab === Tabs.Following ? <FollowList addresses={walletAddresses} setModal={setModal}/> : null}
        </div>
    )
}

export default Memo
