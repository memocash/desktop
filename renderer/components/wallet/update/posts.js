import {MemoScopes} from "./memo";
import {Plural, TrackActivity} from "../../util/activity";

const UpdatePosts = async ({txHashes, setLastUpdate, scopes = MemoScopes}) => {
    if (!txHashes || !txHashes.length) {
        return
    }
    await TrackActivity({
        start: `Downloading details for ${Plural(txHashes.length, "post")}`,
        done: `Downloaded ${Plural(txHashes.length, "post")}`,
        scopes,
    }, async () => {
        await window.electron.syncPosts({txHashes})
        if (typeof setLastUpdate == "function") {
            setLastUpdate((new Date()).toISOString())
        }
    })
}

// The profile details sync only fetches tx_hash/text/tx.seen for posts (see
// main/sync/memo.js) - likes/replies/raw need this separate backfill for
// whatever's currently in the local post list.
const BackfillPosts = async ({addresses, userAddresses, setLastUpdate, scopes = MemoScopes}) => {
    const posts = await window.electron.getPosts({addresses, userAddresses})
    await UpdatePosts({txHashes: posts.map(post => post.tx_hash), setLastUpdate, scopes})
}

// The newest posts from everyone, for the feed (main/sync/posts.js).
const UpdateNewPosts = async ({setLastUpdate, scopes = MemoScopes}) =>
    await TrackActivity({
        start: "Loading the latest posts",
        done: count => `Loaded ${Plural(count, "recent post")}`,
        scopes,
    }, async () => {
        const count = await window.electron.syncNewPosts()
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
        return count
    })

export {
    UpdatePosts,
    UpdateNewPosts,
    BackfillPosts,
}
