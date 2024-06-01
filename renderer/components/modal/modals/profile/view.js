import {useEffect, useState} from "react";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import profile from "../../../../styles/profile.module.css";
import styles from "../../../../styles/modal.module.css"
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {Modals} from "../../../../../main/common/util"
import Post from "../../../wallet/memo/post";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import Links from "../../../wallet/snippets/links";
import {UpdateMemoHistory, UpdatePosts} from "../../../wallet/update/index";
import Modal from "../../modal";
import {BsArrowLeft, BsArrowRight, BsPeople, BsPerson} from "react-icons/bs";

const View = ({basic: {setModal, onClose, setChatRoom}, modalProps: {address, lastUpdate}}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
        num_following: 0,
        num_followers: 0,
    })
    const [lastProfileUpdate, setLastProfileUpdate] = useState(false)
    const [posts, setPosts] = useState([])
    const [isFollowing, setIsFollowing] = useState(false)
    const [picData, setPicData] = useState(undefined)
    const [isSelf, setIsSelf] = useState(true)
    const [roomsFollowingCount, setRoomsFollowingCount] = useState(0)
    useEffect(() => {(async () => {
        const profileInfo = await window.electron.getProfileInfo([address])
        if (profileInfo === undefined) {
            return
        }
        setProfileInfo(profileInfo)
        if (profileInfo.pic !== undefined) {
            const picData = await window.electron.getPic(profileInfo.pic)
            setPicData(picData)
        }
        const wallet = await GetWallet()
        let isSelf = false
        for (const walletAddress of wallet.addresses) {
            if (walletAddress === address) {
                isSelf = true
                break
            }
        }
        setIsSelf(isSelf)
        const recentFollow = await window.electron.getRecentFollow(wallet.addresses, address)
        setIsFollowing(recentFollow !== undefined && !recentFollow.unfollow)
        const posts = await window.electron.getPosts({addresses: [address], userAddresses: wallet.addresses})
        setPosts(posts)
    })()}, [lastUpdate, lastProfileUpdate])
    useEffect(() => {(async () => {
        await UpdateMemoHistory({addresses: [address], setLastUpdate: setLastProfileUpdate})
        let txHashes = []
        for (let i = 0; i < posts.length; i++) {
            txHashes.push(posts[i].tx_hash)
        }
        await UpdatePosts({txHashes, setLastUpdate: setLastProfileUpdate})
        const roomsFollowingCount = await window.electron.getAddressesRoomFollowCount({addresses: [address]})
        if (roomsFollowingCount.length) {
            setRoomsFollowingCount(roomsFollowingCount[0].count)
        }
    })()}, [address])
    const clickFollow = async (address, unfollow) => {
        const followOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(unfollow ? bitcoin.Prefix.Unfollow : bitcoin.Prefix.Follow, "hex"),
            Buffer.from(bitcoin.GetPkHashFromAddress(address), "hex"),
        ])
        const wallet = await GetWallet()
        const recentFollow = await window.electron.getRecentFollow(wallet.addresses, address)
        let beatHash
        if (recentFollow && !recentFollow.block_hash) {
            beatHash = recentFollow.tx_hash
        }
        await CreateTransaction(wallet, [{script: followOpReturnOutput}], setModal, null, beatHash)
    }
    return (
        <Modal onClose={onClose}>
            <div className={profile.header_modal}>
                <div className={profile.pic}>
                    <img alt={"Profile image"} className={profile.img}
                         src={picData ? `data:image/png;base64,${Buffer.from(picData).toString("base64")}` :
                             "/default-profile.jpg"}/>
                </div>
                <div className={profile.info}>
                    <h2>{profileInfo.name ? profileInfo.name : "Name not set"}</h2>
                    <p className={profile.text}>
                        <Links>{profileInfo.profile ? profileInfo.profile : "Profile not set"}</Links>
                    </p>
                    <p>Address: {address}</p>
                    <p>
                        <button title={"Following"} onClick={() => setModal(Modals.Following, {address})}>
                            {profileInfo.num_following} Following
                        </button>
                        <button title={"Followers"} onClick={() => setModal(Modals.Followers, {address})}>
                            {profileInfo.num_followers} Followers
                        </button>
                        <button title={"Chat Rooms Following"}
                                onClick={() => setModal(Modals.ChatRoomFollowing, {address})}>
                            {roomsFollowingCount} Rooms
                        </button>
                        {!isSelf && <button onClick={() => clickFollow(address, isFollowing)}>
                            {isFollowing ? "Unfollow" : "Follow"}</button>}
                    </p>
                </div>
            </div>
            <div className={profile.posts}>
                {posts.map((post, i) => {
                    return (
                        <Post key={i} post={post} setModal={setModal} setChatRoom={setChatRoom}/>
                    )
                })}
            </div>
            <div className={styles.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default View
