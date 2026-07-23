const {Select, Insert} = require("../sqlite");
const {SaveTransactions} = require("./txs");
const {historicallyValid} = require("../common/profile_links");

const GetPosts = async ({conf, addresses, userAddresses}) => {
    const where = "memo_posts.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND " + historicallyValid("memo_posts.address", "memo_posts.tx_hash")
    const query = getSelectQuery({userAddresses, where})
    return await Select(conf, "memo_posts-multi", query, [...userAddresses, ...addresses])
}

// Newest posts from everyone, not just the wallet's own addresses or who it
// follows. The local table only holds what's been synced, so UpdateNewPosts
// (posts_newest) is what actually pulls in strangers' posts before this reads.
// ranked reorders the same pool by relevance (see RankedOrder) instead of time.
const GetNewPosts = async ({conf, userAddresses, ranked}) => {
    const orderBy = ranked ? RankedOrder : NewestOrder
    return await Select(conf, "memo_posts-new", getSelectQuery({userAddresses, where: "1", orderBy}), [...userAddresses])
}

const GetPost = async ({conf, txHash, userAddresses}) => {
    const results = await Select(conf, "memo_posts", getSelectQuery({where: "memo_posts.tx_hash = ?", userAddresses}),
        [...userAddresses, txHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const GetPostReplies = async ({conf, txHash, userAddresses}) => {
    const join = "JOIN memo_replies parent ON (parent.child_tx_hash = memo_posts.tx_hash)"
    const where = "parent.parent_tx_hash = ?"
    return await Select(conf, "memo_posts-replies", getSelectQuery({where, join, userAddresses}),
        [...userAddresses, txHash])
}

const GetPostParent = async ({conf, txHash, userAddresses}) => {
    const join = "JOIN memo_replies child ON (child.parent_tx_hash = memo_posts.tx_hash)"
    const where = "child.child_tx_hash = ?"
    const results = await Select(conf, "memo_posts-parent", getSelectQuery({where, join, userAddresses}),
        [...userAddresses, txHash])
    if (results.length === 0) {
        return undefined
    }
    return results[0]
}

const GetRoomPosts = async ({conf, room, userAddresses}) => {
    const where = "memo_chat_post.room = ?"
    return await Select(conf, "memo_posts-room", getSelectQuery({where, userAddresses}),
        [...userAddresses, room])
}

// A post's effective time: prefer whichever of block/seen is earlier, but fall
// back to the other when one is missing. Shared by the SELECT (as the timestamp
// column) and by RankedOrder's recency term, which can't use the "timestamp"
// alias - inside an expression SQLite reads it as the ambiguous real column on
// blocks/tx_seens rather than the output alias.
const timestampSelect = "" +
    "MIN(" +
    "   COALESCE(blocks.timestamp, tx_seens.timestamp), " +
    "   COALESCE(tx_seens.timestamp, blocks.timestamp)" +
    ")"

const NewestOrder = "timestamp DESC"

// Ranked feed: newest-first stays the baseline, but engagement lifts a post
// above strictly-newer neighbours. Hacker-News-style gravity decay keeps it
// recency-dominant (an old post can't win on likes alone), while the "1 +" base
// means a brand-new post with no engagement still ranks purely on recency.
// Likes are run through ln() because a few posts have thousands of them and a
// linear weight would let one old like-magnet dominate; replies are far rarer
// (single digits here) and weighted higher as the stronger signal. like_count /
// reply_count reference the SELECT aliases, which is unambiguous - no real
// column has those names, unlike timestamp above.
const RankWeightLike = 1.5
const RankWeightReply = 2.5
const RankGravity = 1.5
const RankedOrder = "" +
    "(1 + " + RankWeightLike + " * ln(1 + like_count) + " + RankWeightReply + " * reply_count) " +
    "/ pow((julianday('now') - julianday(" + timestampSelect + ")) * 24 + 2, " + RankGravity + ") DESC"

const getSelectQuery = ({join = "", userAddresses, where, orderBy = NewestOrder}) => {
    // Resolve author metadata through accepted profile links. Revoked links
    // retain fields created before their revoke cutoff.
    // profile view's merge semantics: fields on the posting address win, then
    // a field from another address in its transitive linked-address cluster is
    // used. Name and pic are selected independently because linked profiles
    // commonly split those fields across addresses.
    const linkedAuthors = "" +
        "WITH RECURSIVE active_profile_links(address, linked_address) AS (" +
        "   SELECT link_requests.address, link_requests.parent_address " +
        "   FROM link_requests " +
        "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "   UNION " +
        "   SELECT link_requests.parent_address, link_requests.address " +
        "   FROM link_requests " +
        "   JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "), linked_author_addresses(origin, address) AS (" +
        "   SELECT DISTINCT address, address FROM memo_posts " +
        "   UNION " +
        "   SELECT linked_author_addresses.origin, active_profile_links.linked_address " +
        "   FROM linked_author_addresses " +
        "   JOIN active_profile_links " +
        "       ON (active_profile_links.address = linked_author_addresses.address)" +
        ") "
    const authorName = "(" +
        "SELECT profile_names.name " +
        "FROM linked_author_addresses " +
        "JOIN profiles ON (profiles.address = linked_author_addresses.address) " +
        "JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "WHERE linked_author_addresses.origin = memo_posts.address " +
        "AND " + historicallyValid("linked_author_addresses.address", "profile_names.tx_hash") + " " +
        "ORDER BY (linked_author_addresses.address = memo_posts.address) DESC, " +
        "   linked_author_addresses.address ASC LIMIT 1" +
        ")"
    const authorPic = "(" +
        "SELECT images.data " +
        "FROM linked_author_addresses " +
        "JOIN profiles ON (profiles.address = linked_author_addresses.address) " +
        "JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE linked_author_addresses.origin = memo_posts.address " +
        "AND " + historicallyValid("linked_author_addresses.address", "profile_pics.tx_hash") + " " +
        "ORDER BY (linked_author_addresses.address = memo_posts.address) DESC, " +
        "   linked_author_addresses.address ASC LIMIT 1" +
        ")"
    const authorAlias = "(" +
        "SELECT address_aliases.alias " +
        "FROM address_aliases " +
        "JOIN linked_author_addresses " +
        "   ON (linked_author_addresses.address = address_aliases.address) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = address_aliases.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = address_aliases.tx_hash) " +
        "WHERE linked_author_addresses.origin = memo_posts.address " +
        "AND address_aliases.target_address = memo_posts.address " +
        "ORDER BY COALESCE(blocks.height, 1000000000) DESC, " +
        "COALESCE(tx_seens.timestamp, blocks.timestamp) DESC, address_aliases.tx_hash DESC LIMIT 1" +
        ")"
    return linkedAuthors +
        "SELECT " +
        "   memo_posts.*, " +
        "   " + authorName + " AS name, " +
        "   " + authorPic + " AS pic, " +
        "   " + authorAlias + " AS alias, " +
        "   " + timestampSelect + " AS timestamp, " +
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
        "LEFT JOIN memo_replies ON (memo_replies.parent_tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN memo_likes ON (memo_likes.post_tx_hash = memo_posts.tx_hash) " +
        "LEFT JOIN memo_chat_post ON (memo_chat_post.tx_hash = memo_posts.tx_hash) " +
        join + " " +
        "WHERE " + where + " " +
        "GROUP BY memo_posts.tx_hash " +
        "ORDER BY " + orderBy + " " +
        "LIMIT 50 "
}

const SaveMemoPosts = async (conf, posts) => {
    const replies = posts.map(post => post.replies).flat().filter(v => v) // filter removes nulls
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
    await Insert(conf, "memo_posts", "INSERT OR REPLACE INTO memo_posts (address, text, tx_hash) " +
        "VALUES " + Array(allPosts.length).fill("(?, ?, ?)").join(", "), allPosts.map(post => [
        post.lock.address, post.text, post.tx_hash]).flat())
    if (parentChildren.length) {
        await Insert(conf, "memo_replies", "INSERT OR IGNORE INTO memo_replies (parent_tx_hash, child_tx_hash) " +
            "VALUES " + Array(parentChildren.length).fill("(?, ?)").join(", "), parentChildren.map(parentChild => [
            parentChild.parent, parentChild.child]).flat())
    }
    await SaveTransactions(conf, allPosts.map(post => {
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
    await Insert(conf, "memo_likes", "INSERT OR REPLACE INTO memo_likes (address, like_tx_hash, post_tx_hash, tip) " +
        "VALUES " + Array(allLikes.length).fill("(?, ?, ?, ?)").join(", "), allLikes.map(like => [
        like.lock.address, like.tx_hash, like.post_tx_hash, like.tip]).flat())
    await SaveTransactions(conf, allLikes.map(like => {
        return like.tx
    }))
}

module.exports = {
    GetNewPosts,
    GetPost,
    GetPosts,
    GetPostParent,
    GetPostReplies,
    GetRoomPosts,
    SaveMemoPosts,
}
