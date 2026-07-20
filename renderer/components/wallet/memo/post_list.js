import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";

// addresses (optional) widens the post list beyond the wallet's own addresses,
// e.g. to its linked-address cluster; empty/absent falls back to the wallet.
const PostList = ({setModal, lastUpdate, addresses}) => {
    const [posts, setPosts] = useState([])
    useEffect(() => {
        (async () => {
            const wallet = await GetWallet()
            const posts = await window.electron.getPosts({
                addresses: (addresses && addresses.length) ? addresses : wallet.addresses,
                userAddresses: wallet.addresses,
            })
            setPosts(posts)
        })()
    }, [lastUpdate, addresses]);
    return (
        <div className={profile.post_list}>
            {posts.map((post) =>
                <Post key={post.tx_hash} post={post} setModal={setModal}/>
            )}
        </div>
    )
}

export default PostList
