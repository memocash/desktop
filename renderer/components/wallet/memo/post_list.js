import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import Post from "./post";

const PostList = ({setModal}) => {
    const [posts, setPosts] = useState([])
    useEffect(() => {
        (async () => {
            const wallet = await GetWallet()
            const posts = await window.electron.getPosts({addresses: wallet.addresses, userAddresses: wallet.addresses})
            setPosts(posts)
        })()
    }, []);
    return (
        <div className={profile.post_list}>
            {posts.map((post) =>
                <Post key={post.tx_hash} post={post} setModal={setModal}/>
            )}
        </div>
    )
}

export default PostList
