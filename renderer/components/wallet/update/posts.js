import {LikesQuery, PostFields, ProfileFields, TxQuery} from "../../util/graphql";
import {SyncLinkedProfiles} from "./links";

// Number of newest posts pulled from the server for the feed. GetNewPosts reads
// back the newest 50 rows locally, so asking for more here would only fetch
// posts the feed can't show.
const NewPostsLimit = 50

const UpdatePosts = async ({txHashes, setLastUpdate}) => {
    if (!txHashes || !txHashes.length) {
        return
    }
    const query = `
        query($txHashes: [Hash!]) {
            posts(txHashes: $txHashes) {
                tx_hash
                text
                lock {
                    address
                }
                ${TxQuery}
                ${LikesQuery}
                parent {
                    ${PostFields}
                }
                replies {
                    ${PostFields}
                }
            }
        }
        `
    let data = await window.electron.graphQL(query, {
        txHashes: txHashes,
    })
    await window.electron.saveMemoPosts(data.data.posts)
    if (typeof setLastUpdate == "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

// UpdateMemoHistory's posts query only fetches tx_hash/text/tx.seen (see
// update/memo.js) - likes/replies/raw need this separate backfill for
// whatever's currently in the local post list.
const BackfillPosts = async ({addresses, userAddresses, setLastUpdate}) => {
    const posts = await window.electron.getPosts({addresses, userAddresses})
    await UpdatePosts({txHashes: posts.map(post => post.tx_hash), setLastUpdate})
}

// The feed shows everyone's posts, so unlike the rest of the memo sync it can't
// start from a known set of addresses or tx hashes - posts_newest is the only
// query that returns posts from users the wallet has never seen.
// Replies are requested trimmed (no raw/inputs/outputs, no likes, no nested
// profile) rather than with PostFields: they're only saved so the post's reply
// count and their timestamps resolve locally, and a prolific thread's full
// reply detail is what makes these payloads balloon. Whoever opens a post gets
// the full detail from UpdatePosts anyway.
const UpdateNewPosts = async ({setLastUpdate}) => {
    const query = `
        query ($limit: Uint32) {
            posts_newest(limit: $limit) {
                tx_hash
                text
                lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
                room {
                    name
                }
                ${TxQuery}
                ${LikesQuery}
                replies {
                    tx_hash
                    text
                    lock {
                        address
                    }
                    tx {
                        hash
                        seen
                    }
                }
            }
        }
        `
    const data = await window.electron.graphQL(query, {limit: NewPostsLimit})
    const posts = data.data.posts_newest
    if (!posts || !posts.length) {
        return
    }
    // Profiles first: the local post list joins names/pics by address, so
    // without this every post from someone the wallet doesn't already follow
    // renders nameless with the default pic.
    const profiles = dedupeProfiles(posts)
    await window.electron.saveMemoProfiles(profiles)
    await SyncLinkedProfiles({addresses: profiles.map(profile => profile.lock.address)})
    // Room posts go through saveChatRoom instead (it saves the post *and* its
    // room membership, which is what shows the room link on the post).
    const roomPosts = posts.filter(post => post.room && post.room.name)
    await window.electron.saveMemoPosts(posts.filter(post => !roomPosts.includes(post)))
    for (const name of new Set(roomPosts.map(post => post.room.name))) {
        await window.electron.saveChatRoom({name, posts: roomPosts.filter(post => post.room.name === name)})
    }
    // Pics are downloaded one at a time in the main process, so this is the slow
    // part of the sync - it runs last, after the posts themselves are readable.
    await window.electron.saveMemoProfileImages(profiles)
    if (typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

// One address can have several posts in the feed, and a duplicate profile would
// mean re-saving it and (worse) downloading the same pic once per post.
const dedupeProfiles = (posts) => {
    const profiles = {}
    for (const post of posts) {
        if (!post.lock || !post.lock.profile || profiles[post.lock.address]) {
            continue
        }
        profiles[post.lock.address] = {...post.lock.profile, lock: {address: post.lock.address}}
    }
    return Object.values(profiles)
}

export {
    UpdatePosts,
    UpdateNewPosts,
    BackfillPosts,
}
