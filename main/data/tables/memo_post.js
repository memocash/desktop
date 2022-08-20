const {Select, Insert} = require("../sqlite");
const {SaveTransactions} = require("./txs");

const GetPosts = async ({addresses, userAddresses}) => {
    const where = "memo_posts.address IN (" + Array(addresses.length).fill("?").join(", ") + ")"
    const query = getSelectQuery({userAddresses, where})
    return await Select("memo_posts-multi", query, [...userAddresses, ...addresses])
}

const GetPost = async ({txHash, userAddresses}) => {
    const results = await Select("memo_posts", getSelectQuery({where: "memo_posts.tx_hash = ?", userAddresses}),
        [...userAddresses, txHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const GetPostReplies = async ({txHash, userAddresses}) => {
    const join = "JOIN memo_replies parent ON (parent.child_tx_hash = memo_posts.tx_hash)"
    const where = "parent.parent_tx_hash = ?"
    return await Select("memo_posts-replies", getSelectQuery({where, join, userAddresses}),
        [...userAddresses, txHash])
}

const GetPostParent = async ({txHash, userAddresses}) => {
    const join = "JOIN memo_replies child ON (child.parent_tx_hash = memo_posts.tx_hash)"
    const where = "child.child_tx_hash = ?"
    const results = await Select("memo_posts-parent", getSelectQuery({where, join, userAddresses}),
        [...userAddresses, txHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const GetRoomPosts = async ({room, userAddresses}) => {
    const where = "memo_chat_post.room = ?"
    return await Select("memo_posts-room", getSelectQuery({where, userAddresses}),
        [...userAddresses, room])
}

const getSelectQuery = ({join = "", userAddresses, where}) => {
    return "" +
        "SELECT " +
        "   memo_posts.*, " +
        "   profile_names.name, " +
        "   images.data AS pic, " +
        "   MIN(" +
        "       COALESCE(blocks.timestamp, tx_seens.timestamp), " +
        "       COALESCE(tx_seens.timestamp, blocks.timestamp)" +
        "   ) AS timestamp, " +
        "   COUNT(DISTINCT memo_replies.child_tx_hash) AS reply_count, " +
        "   COUNT(DISTINCT memo_likes.like_tx_hash) AS like_count, " +
        "   SUM(CASE WHEN memo_likes.address IN (" +
        "       " + Array(userAddresses.length).fill("?").join(", ") + "" +
        "   ) THEN 1 ELSE 0 END) > 0 AS has_liked, " +
        "   SUM(memo_likes.tip) AS tip_total, " +
        "   memo_chat_post.room " +
        "FROM memo_posts " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = memo_posts.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_posts.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "LEFT JOIN memo_replies ON (memo_replies.parent_tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN memo_likes ON (memo_likes.post_tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN memo_chat_post ON (memo_chat_post.tx_hash = memo_posts.tx_hash) " +
        join + " " +
        "WHERE " + where + " " +
        "GROUP BY memo_posts.tx_hash " +
        "ORDER BY timestamp DESC " +
        "LIMIT 50 "
}

const SaveMemoPosts = async (posts) => {
    const replies = posts.map(post => post.replies).flat()
    let parents = []
    let parentChildren = []
    for (let i = 0; i < posts.length; i++) {
        if (posts[i].parent) {
            parents.push(posts[i].parent)
            parentChildren.push({parent: posts[i].parent.tx_hash, child: posts[i].tx_hash})
        }
        if (!posts[i].replies) {
            continue
        }
        for (let j = 0; j < posts[i].replies.length; j++) {
            parentChildren.push({parent: posts[i].tx_hash, child: posts[i].replies[j].tx_hash})
        }
    }
    const allPosts = [...parents, ...posts, ...replies]
    if (allPosts.length === 0) {
        return
    }
    await Insert("memo_posts", "INSERT OR REPLACE INTO memo_posts (address, text, tx_hash) " +
        "VALUES " + Array(allPosts.length).fill("(?, ?, ?)").join(", "), allPosts.map(post => [
        post.lock.address, post.text, post.tx_hash]).flat())
    if (parentChildren.length) {
        await Insert("memo_replies", "INSERT OR IGNORE INTO memo_replies (parent_tx_hash, child_tx_hash) " +
            "VALUES " + Array(parentChildren.length).fill("(?, ?)").join(", "), parentChildren.map(parentChild => [
            parentChild.parent, parentChild.child]).flat())
    }
    await SaveTransactions(allPosts.map(post => {
        return post.tx
    }))
    let allLikes = []
    for (let j = 0; j < allPosts.length; j++) {
        const post = allPosts[j]
        if (post.likes && post.likes.length) {
            for (let k = 0; k < post.likes.length; k++) {
                post.likes[k].post_tx_hash = post.tx_hash
            }
            allLikes = allLikes.concat(post.likes)
        }
    }
    if (allLikes.length === 0) {
        return
    }
    await Insert("memo_likes", "INSERT OR REPLACE INTO memo_likes (address, like_tx_hash, post_tx_hash, tip) " +
        "VALUES " + Array(allLikes.length).fill("(?, ?, ?, ?)").join(", "), allLikes.map(like => [
        like.lock.address, like.tx_hash, like.post_tx_hash, like.tip]).flat())
    await SaveTransactions(allLikes.map(like => {
        return like.tx
    }))
}

module.exports = {
    GetPost,
    GetPosts,
    GetPostParent,
    GetPostReplies,
    GetRoomPosts,
    SaveMemoPosts,
}
