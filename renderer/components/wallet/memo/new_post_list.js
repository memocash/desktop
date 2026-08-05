import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";
// "../update/index", not "../update": there's an update.js component alongside
// the update/ directory, and the bare path resolves to the file, silently
// importing undefined from it.
import {UpdateNewPosts} from "../update/index";
import {Loading} from "../../util/loading";
import {EmptyState} from "../../util/empty";
import {BsExclamationTriangle, BsFire, BsGlobe} from "../../util/icons";

// Pull the newest posts network-wide from the server first, then read them back
// out of the local db so likes/replies/names render the same way they do
// everywhere else. ranked reorders that same pool by relevance
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
            {posts.map((post) =>
                <Post key={post.tx_hash} post={post} setModal={setModal} setChatRoom={setChatRoom} isFeedRow/>
            )}
            {failed && posts.length > 0 && <div className={profile.noPosts}>
                Could not reach the network, showing saved posts
            </div>}
            {!posts.length && (loading ?
                <Loading>Loading new posts...</Loading> :
                failed ?
                    // Nothing saved to fall back on, so the banner above would
                    // be promising posts that aren't there.
                    <EmptyState icon={<BsExclamationTriangle/>} title={"Could not reach the network"}>
                        Check the connection indicator below and try again.
                    </EmptyState> :
                    <EmptyState icon={ranked ? <BsFire/> : <BsGlobe/>} title={"Nothing here yet"}>
                        Posts from across the network show up here.
                    </EmptyState>)}
        </div>
    )
}

export default NewPostList
