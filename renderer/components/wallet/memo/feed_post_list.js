import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
import {BackfillPosts, UpdateMemoHistory} from "../update/index";

const FeedPostList = ({setModal, setChatRoom, lastUpdate, addresses}) => {
    const [posts, setPosts] = useState([])
    const [feedUpdate, setFeedUpdate] = useState("")
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const [feed, setFeed] = useState({followedAddresses: [], userAddresses: []})
    const addressKey = [...(addresses || [])].sort().join("\0")
    const followedAddressKey = [...feed.followedAddresses].sort().join("\0")
    const userAddressKey = [...feed.userAddresses].sort().join("\0")

    useEffect(() => {
        let active = true
        const syncFeed = async () => {
            if (!addresses || !addresses.length) {
                setFeed({followedAddresses: [], userAddresses: []})
                setPosts([])
                setLoading(false)
                return
            }
            setLoading(true)
            setFailed(false)
            const notifyUpdate = value => {
                if (active) {
                    setFeedUpdate(value)
                }
            }
            try {
                const wallet = await GetWallet()
                const following = await window.electron.getFollowing(addresses, {limit: null})
                const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
                if (!active) {
                    return
                }
                setFeed({followedAddresses, userAddresses: wallet.addresses})
                if (followedAddresses.length) {
                    await UpdateMemoHistory({addresses: followedAddresses, setLastUpdate: notifyUpdate})
                    await BackfillPosts({addresses: followedAddresses, userAddresses: wallet.addresses,
                        setLastUpdate: notifyUpdate})
                }
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
    }, [addressKey])

    useEffect(() => {
        let active = true
        const loadPosts = async () => {
            const nextPosts = feed.followedAddresses.length ? await window.electron.getPosts({
                addresses: feed.followedAddresses,
                userAddresses: feed.userAddresses,
            }) : []
            if (active) {
                setPosts(nextPosts)
            }
        }
        loadPosts().catch(e => console.log("FeedPostList: saved post read failed", e))
        return () => { active = false }
    }, [followedAddressKey, userAddressKey, lastUpdate, feedUpdate])

    return (
        <div className={profile.post_list}>
            {posts.map(post =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom}/>
            )}
            {failed && <div className={profile.noPosts}>
                Could not refresh feed, showing saved posts
            </div>}
            {!posts.length && !failed && <div className={profile.noPosts}>
                {loading ? "Loading feed..." : "No posts from people you follow"}
            </div>}
        </div>
    )
}

export default FeedPostList
