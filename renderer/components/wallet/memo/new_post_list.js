import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
// "../update/index", not "../update": there's an update.js component alongside
// the update/ directory, and the bare path resolves to the file, silently
// importing undefined from it.
import {UpdateNewPosts} from "../update/index";

// Unlike PostList (which reads posts the wallet already has locally from its own
// addresses), this pulls the newest posts network-wide from the server first,
// then reads them back out of the local db so likes/replies/names render the
// same way they do everywhere else. ranked reorders that same pool by relevance
// (likes/replies/recency) instead of strict time - the sync is identical.
const NewPostList = ({setModal, setChatRoom, lastUpdate, ranked = false}) => {
    const [posts, setPosts] = useState([])
    const [feedUpdate, setFeedUpdate] = useState("")
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    useEffect(() => {(async () => {
        try {
            await UpdateNewPosts({setLastUpdate: setFeedUpdate})
        } catch (e) {
            // Without this the feed silently falls back to whatever posts are
            // already in the local db, which looks like a working feed showing
            // stale posts rather than a failed sync.
            console.log("NewPostList: new posts sync failed", e)
            setFailed(true)
        }
        setLoading(false)
    })()}, [])
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        setPosts(await window.electron.getNewPosts({userAddresses: wallet.addresses, ranked}))
    })()}, [lastUpdate, feedUpdate, ranked]);
    return (
        <div className={profile.post_list}>
            {failed && <div className={profile.noPosts}>
                Could not load new posts, showing saved posts
            </div>}
            {posts.map((post) =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom}/>
            )}
            {!posts.length && !failed && <div className={profile.noPosts}>
                {loading ? "Loading new posts..." : "No new posts"}
            </div>}
        </div>
    )
}

export default NewPostList
