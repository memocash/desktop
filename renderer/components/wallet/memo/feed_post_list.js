import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
import {BackfillPosts, SyncProfileLinks, UpdateMemoHistory} from "../update/index";

const addressKeyOf = (addresses) => [...(addresses || [])].sort().join("\0")

const FeedPostList = ({setModal, setChatRoom, lastUpdate, addresses}) => {
    const [posts, setPosts] = useState([])
    const [feedUpdate, setFeedUpdate] = useState("")
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const [feed, setFeed] = useState({followedAddresses: [], postAddresses: [], userAddresses: []})
    const addressKey = addressKeyOf(addresses)
    const followedAddressKey = addressKeyOf(feed.followedAddresses)
    const postAddressKey = addressKeyOf(feed.postAddresses)
    const userAddressKey = addressKeyOf(feed.userAddresses)

    useEffect(() => {
        let active = true
        const refreshFollowing = async () => {
            if (!addresses || !addresses.length) {
                setFeed(current =>
                    addressKeyOf(current.followedAddresses) === "" &&
                    addressKeyOf(current.postAddresses) === "" &&
                    addressKeyOf(current.userAddresses) === ""
                        ? current
                        : {followedAddresses: [], postAddresses: [], userAddresses: []})
                setPosts(current => current.length ? [] : current)
                setFailed(false)
                setLoading(false)
                return
            }
            try {
                const wallet = await GetWallet()
                const following = await window.electron.getFollowing(addresses, {limit: null})
                const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
                if (!active) {
                    return
                }
                const nextFollowedAddressKey = addressKeyOf(followedAddresses)
                const nextUserAddressKey = addressKeyOf(wallet.addresses)
                setFeed(current =>
                    addressKeyOf(current.followedAddresses) === nextFollowedAddressKey &&
                    addressKeyOf(current.userAddresses) === nextUserAddressKey
                        ? current
                        : {followedAddresses, postAddresses: followedAddresses,
                            userAddresses: wallet.addresses})
                if (!followedAddresses.length) {
                    setFailed(false)
                    setLoading(false)
                }
            } catch (e) {
                console.log("FeedPostList: following read failed", e)
                if (active) {
                    setFailed(true)
                    setLoading(false)
                }
            }
        }
        refreshFollowing()
        return () => { active = false }
    }, [addressKey, lastUpdate])

    useEffect(() => {
        let active = true
        const syncFeed = async () => {
            if (!feed.followedAddresses.length) {
                return
            }
            setLoading(true)
            setFailed(false)
            const notifyUpdate = value => {
                if (active) {
                    setFeedUpdate(value)
                }
            }
            let postAddresses = feed.followedAddresses
            try {
                postAddresses = await SyncProfileLinks({addresses: feed.followedAddresses})
                if (active) {
                    setFeed(current => ({...current, postAddresses}))
                }
            } catch (e) {
                console.log("FeedPostList: link expansion failed, using followed addresses", e)
            }
            if (!active) {
                return
            }
            try {
                await UpdateMemoHistory({addresses: postAddresses, setLastUpdate: notifyUpdate})
                await BackfillPosts({addresses: postAddresses,
                    userAddresses: feed.userAddresses, setLastUpdate: notifyUpdate})
            } catch (e) {
                console.log("FeedPostList: feed sync failed", e)
                if (active) {
                    setFailed(true)
                }
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }
        syncFeed()
        return () => { active = false }
    }, [followedAddressKey, userAddressKey])

    useEffect(() => {
        let active = true
        const loadPosts = async () => {
            const nextPosts = feed.postAddresses.length ? await window.electron.getPosts({
                addresses: feed.postAddresses,
                userAddresses: feed.userAddresses,
            }) : []
            if (active) {
                setPosts(nextPosts)
            }
        }
        loadPosts().catch(e => console.log("FeedPostList: saved post read failed", e))
        return () => { active = false }
    }, [postAddressKey, userAddressKey, lastUpdate, feedUpdate])

    return (
        <div className={profile.post_list}>
            {posts.map(post =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom} isFeedRow/>
            )}
            {loading && !posts.length &&
                <div className={profile.noPosts}>Loading the latest posts...</div>}
            {!loading && failed && posts.length > 0 && <div className={profile.noPosts}>
                Could not refresh feed, showing saved posts
            </div>}
            {!loading && !posts.length && <div className={profile.noPosts}>
                {failed ? "Could not load feed" :
                    "No posts from people you follow"}
            </div>}
        </div>
    )
}

export default FeedPostList
