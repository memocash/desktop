const {GraphQL} = require("../client/graphql")
const {SaveChatRoom, SaveMemoPosts, SaveMemoProfiles} = require("../data/tables")
const {LikesQuery, PostFields, ProfileFields, TxQuery} = require("./fields")
const {SyncLinkedProfiles, saveImages} = require("./memo")

// Number of newest posts pulled from the server for the feed. GetNewPosts reads
// back the newest 50 rows locally, so asking for more here would only fetch
// posts the feed can't show.
const NewPostsLimit = 50

const PostsQuery = `
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

const PostsSubscription = `
    subscription($txHashes: [Hash!]) {
        posts(hashes: $txHashes) {
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

// The full detail - likes, parent, replies, raw - of a known set of posts.
// The profile details sync only fetches tx_hash/text/tx.seen (see memo.js),
// so whatever the post lists show comes through here to fill in the rest.
const SyncPosts = async ({conf, txHashes, graphQL = GraphQL}) => {
    if (!txHashes || !txHashes.length) {
        return 0
    }
    const data = await graphQL({network: conf, query: PostsQuery, variables: {txHashes}})
    await SaveMemoPosts(conf, data.data.posts)
    return (data.data.posts || []).length
}

// The feed shows everyone's posts, so unlike the rest of the memo sync it can't
// start from a known set of addresses or tx hashes - posts_newest is the only
// query that returns posts from users the wallet has never seen.
// Replies are requested trimmed (no raw/inputs/outputs, no likes, no nested
// profile) rather than with PostFields: they're only saved so the post's reply
// count and their timestamps resolve locally, and a prolific thread's full
// reply detail is what makes these payloads balloon. Whoever opens a post gets
// the full detail from SyncPosts anyway.
const NewPostsQuery = `
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

const SyncNewPosts = async ({conf, graphQL = GraphQL}) => {
    const data = await graphQL({network: conf, query: NewPostsQuery, variables: {limit: NewPostsLimit}})
    const posts = data.data.posts_newest
    if (!posts || !posts.length) {
        return 0
    }
    // Profiles first: the local post list joins names/pics by address, so
    // without this every post from someone the wallet doesn't already follow
    // renders nameless with the default pic.
    const profiles = dedupeProfiles(posts)
    await SaveMemoProfiles(conf, profiles)
    await SyncLinkedProfiles({conf, addresses: profiles.map(profile => profile.lock.address), graphQL})
    // Room posts go through SaveChatRoom instead (it saves the post *and* its
    // room membership, which is what shows the room link on the post).
    const roomPosts = posts.filter(post => post.room && post.room.name)
    await SaveMemoPosts(conf, posts.filter(post => !roomPosts.includes(post)))
    for (const name of new Set(roomPosts.map(post => post.room.name))) {
        await SaveChatRoom(conf, {name, posts: roomPosts.filter(post => post.room.name === name)})
    }
    // Pics are downloaded one at a time, so this is the slow part of the sync
    // - it runs last, after the posts themselves are readable.
    await saveImages(conf, profiles)
    return posts.length
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

// A post update pushed by the subscription - a new like or reply on it.
const SaveNewPost = async ({conf, post}) => SaveMemoPosts(conf, [post])

module.exports = {
    PostsSubscription,
    SaveNewPost,
    SyncNewPosts,
    SyncPosts,
}
