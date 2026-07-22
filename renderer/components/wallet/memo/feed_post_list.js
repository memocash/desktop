import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
import {BackfillPosts, UpdateMemoHistory} from "../update/index";

const FeedPostList = ({setModal, setChatRoom, lastUpdate, addresses}) => {
    const [posts, setPosts] = useState([])
    const [feedUpdate, setFeedUpdate] = useState("")
    const [loading, setLoading] = useState(true)

    useEffect(() => {(async () => {
        if (!addresses || !addresses.length) {
            return
        }
        const wallet = await GetWallet()
        const following = await window.electron.getFollowing(addresses)
        const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
        if (followedAddresses.length) {
            await UpdateMemoHistory({addresses: followedAddresses, setLastUpdate: setFeedUpdate})
            await BackfillPosts({addresses: followedAddresses, userAddresses: wallet.addresses,
                setLastUpdate: setFeedUpdate})
        }
        setLoading(false)
    })()}, [addresses])

    useEffect(() => {(async () => {
        if (!addresses || !addresses.length) {
            return
        }
        const wallet = await GetWallet()
        const following = await window.electron.getFollowing(addresses)
        const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
        setPosts(followedAddresses.length ? await window.electron.getPosts({
            addresses: followedAddresses,
            userAddresses: wallet.addresses,
        }) : [])
        setLoading(false)
    })()}, [addresses, lastUpdate, feedUpdate])

    return (
        <div className={profile.post_list}>
            {posts.map(post =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom}/>
            )}
            {!posts.length && <div className={profile.noPosts}>
                {loading ? "Loading feed..." : "No posts from people you follow"}
            </div>}
        </div>
    )
}

export default FeedPostList
