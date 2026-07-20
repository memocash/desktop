import {useEffect, useRef, useState} from "react";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import profile from "../../../../styles/profile.module.css";
import styles from "../../../../styles/modal.module.css"
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {Modals} from "../../../../../main/common/util"
import Post from "../../../wallet/memo/post";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import Links from "../../../wallet/snippets/links";
import {BackfillPosts, SyncProfileLinks, UpdateMemoHistory} from "../../../wallet/update/index";
import Modal from "../../modal";
import {BsArrowLeft, BsArrowRight, BsPeople, BsPerson} from "react-icons/bs";

const LinkStatus = {
    None: "none",
    Requested: "requested",
    Incoming: "incoming",
    Active: "active",
}

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
    // The viewed address plus every address actively linked to it (memo
    // identity protocol) - profile info, posts, follows and rooms are all
    // aggregated across the cluster. Viewed address stays first so its own
    // name/profile/pic win in GetProfileInfo's merge.
    const [addresses, setAddresses] = useState([address])
    // Link state between the wallet and the viewed profile. walletAddress is
    // the wallet's side of the link - accepts and revokes must be signed by
    // that exact address for the protocol to count them, so it's passed to
    // CreateTransaction as fromAddress. isWalletAddress (viewed address is
    // itself in the wallet) starts true so link buttons stay hidden until the
    // wallet check runs.
    const [linkState, setLinkState] = useState({status: LinkStatus.None})
    const [isWalletAddress, setIsWalletAddress] = useState(true)
    // UpdateMemoHistory/UpdatePosts can call setLastProfileUpdate several times
    // in quick succession as each sync phase lands, re-firing this effect each
    // time with no cancellation. Guard against an earlier-started run (e.g. one
    // that takes an extra getPic hop) finishing after a later, faster one and
    // clobbering its fresher state.
    const fetchSeqRef = useRef(0)
    useEffect(() => {(async () => {
        const seq = ++fetchSeqRef.current
        const profileInfo = await window.electron.getProfileInfo(addresses)
        if (profileInfo === undefined || seq !== fetchSeqRef.current) {
            return
        }
        setProfileInfo(profileInfo)
        if (profileInfo.pic !== undefined) {
            const picData = await window.electron.getPic(profileInfo.pic)
            if (seq !== fetchSeqRef.current) {
                return
            }
            setPicData(picData)
        }
        const wallet = await GetWallet()
        let isSelf = false
        for (const walletAddress of wallet.addresses) {
            if (addresses.includes(walletAddress)) {
                isSelf = true
                break
            }
        }
        const recentFollow = await window.electron.getRecentFollow(wallet.addresses, address)
        const posts = await window.electron.getPosts({addresses, userAddresses: wallet.addresses})
        const linkRows = await window.electron.getProfileLinks({userAddresses: wallet.addresses, addresses})
        if (seq !== fetchSeqRef.current) {
            return
        }
        // A request appears once per accept row; it's active if any accept is
        // unrevoked (a revoked accept can be superseded by a re-accept). An
        // active link wins over pending requests in either direction.
        const requestRows = {}
        for (const row of linkRows) {
            if (!requestRows[row.request_tx_hash] || (row.accept_tx_hash && !row.revoked)) {
                requestRows[row.request_tx_hash] = row
            }
        }
        let link = {status: LinkStatus.None}
        for (const row of Object.values(requestRows)) {
            const walletIsParent = wallet.addresses.includes(row.parent_address)
            if (row.accept_tx_hash && !row.revoked) {
                link = {
                    status: LinkStatus.Active,
                    acceptTxHash: row.accept_tx_hash,
                    walletAddress: walletIsParent ? row.parent_address : row.child_address,
                }
                break
            }
            if (walletIsParent) {
                link = {
                    status: LinkStatus.Incoming,
                    requestTxHash: row.request_tx_hash,
                    walletAddress: row.parent_address,
                }
            } else if (link.status === LinkStatus.None) {
                link = {status: LinkStatus.Requested}
            }
        }
        setLinkState(link)
        setIsWalletAddress(wallet.addresses.includes(address))
        setIsSelf(isSelf)
        setIsFollowing(recentFollow !== undefined && !recentFollow.unfollow)
        setPosts(posts)
    })()}, [lastUpdate, lastProfileUpdate, addresses])
    useEffect(() => {(async () => {
        // Resolve the linked-address cluster before the rest of the sync so
        // history/posts cover every member. On network failure fall back to
        // whatever links are already in the local db.
        let linked = await SyncProfileLinks({addresses: [address]}).catch(async (e) => {
            console.log("SyncProfileLinks failed", e)
            return await window.electron.getLinkedAddresses([address])
        })
        setAddresses(linked)
        await UpdateMemoHistory({addresses: linked, setLastUpdate: setLastProfileUpdate})
        const wallet = await GetWallet()
        await BackfillPosts({addresses: linked, userAddresses: wallet.addresses, setLastUpdate: setLastProfileUpdate})
        const roomsFollowingCount = await window.electron.getAddressesRoomFollowCount({addresses: linked})
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
    // Link scripts verified byte-for-byte against Jason's on-chain link txs
    // (request 8553916d..., accept cb38deb2..., revoke 09cb74d4...): request
    // pushes the parent's pkhash, accept/revoke push the referenced tx hash in
    // display order. The optional trailing message push is omitted.
    const clickLinkRequest = async () => {
        const requestOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.LinkRequest, "hex"),
            Buffer.from(bitcoin.GetPkHashFromAddress(address), "hex"),
        ])
        const wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: requestOpReturnOutput}], setModal)
    }
    const clickLinkAccept = async ({requestTxHash, walletAddress}) => {
        const acceptOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.LinkAccept, "hex"),
            Buffer.from(requestTxHash, "hex"),
        ])
        const wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: acceptOpReturnOutput}], setModal, null, "", false, walletAddress)
    }
    const clickLinkRevoke = async ({acceptTxHash, walletAddress}) => {
        const revokeOpReturnOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.LinkRevoke, "hex"),
            Buffer.from(acceptTxHash, "hex"),
        ])
        const wallet = await GetWallet()
        await CreateTransaction(wallet, [{script: revokeOpReturnOutput}], setModal, null, "", false, walletAddress)
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
                    {addresses.length > 1 && <p>
                        Linked: {addresses.filter(linkedAddress => linkedAddress !== address)
                        .map((linkedAddress, i) => <span key={i}>
                            {i > 0 ? ", " : ""}
                            <a className={profile.txLink}
                               onClick={() => setModal(Modals.ProfileView, {address: linkedAddress})}>
                                {linkedAddress}
                            </a>
                        </span>)}
                    </p>}
                    <p>
                        <button title={"Following"} onClick={() => setModal(Modals.Following, {address, addresses})}>
                            {profileInfo.num_following} Following
                        </button>
                        <button title={"Followers"} onClick={() => setModal(Modals.Followers, {address, addresses})}>
                            {profileInfo.num_followers} Followers
                        </button>
                        <button title={"Chat Rooms Following"}
                                onClick={() => setModal(Modals.ChatRoomFollowing, {address})}>
                            {roomsFollowingCount} Rooms
                        </button>
                        {!isSelf && <button onClick={() => clickFollow(address, isFollowing)}>
                            {isFollowing ? "Unfollow" : "Follow"}</button>}
                        {!isWalletAddress && linkState.status === LinkStatus.None &&
                            <button title={"Request to link this address with your account"}
                                    onClick={clickLinkRequest}>Request Link</button>}
                        {!isWalletAddress && linkState.status === LinkStatus.Requested &&
                            <button disabled title={"Waiting for this address to accept your link request"}>
                                Link Requested</button>}
                        {!isWalletAddress && linkState.status === LinkStatus.Incoming &&
                            <button title={"This address requested to link with your account"}
                                    onClick={() => clickLinkAccept(linkState)}>Accept Link</button>}
                        {!isWalletAddress && linkState.status === LinkStatus.Active &&
                            <button title={"Revoke the link between this address and your account"}
                                    onClick={() => clickLinkRevoke(linkState)}>Revoke Link</button>}
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
