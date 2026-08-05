const {Select, InsertBatch} = require("../sqlite");
const {KeepFirst, KeepLast, Rows, Statements} = require("../common/rows");
const {SaveTransactions} = require("./txs");
const {clusterField, historicallyValid, linkedClusterCte, txJoinTimestamp} = require("../common/profile_links");

const PostRows = () => ({
    posts: Rows("INSERT OR REPLACE INTO memo_posts (address, text, tx_hash)", KeepLast),
    replies: Rows("INSERT OR IGNORE INTO memo_replies (parent_tx_hash, child_tx_hash)", KeepFirst),
    likes: Rows("INSERT OR REPLACE INTO memo_likes (address, like_tx_hash, post_tx_hash, tip)", KeepLast),
})

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
const timestampSelect = txJoinTimestamp

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
    const linkedAuthors = linkedClusterCte({
        cluster: "linked_author_addresses",
        seedSelect: "address, address",
        seedFrom: "memo_posts",
    })
    const authorName = clusterField({
        cluster: "linked_author_addresses", origin: "memo_posts.address",
        join: "JOIN profile_names ON (profile_names.tx_hash = profiles.name) ",
        field: "profile_names.name", txHash: "profile_names.tx_hash",
    })
    const authorPic = clusterField({
        cluster: "linked_author_addresses", origin: "memo_posts.address",
        join: "JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
            "JOIN images ON (images.url = profile_pics.pic) ",
        field: "images.data", txHash: "profile_pics.tx_hash",
    })
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
        // A subquery rather than SUM(memo_likes.tip): the memo_replies join (and
        // a caller's own join) repeats each like row once per reply, which the
        // counts above dodge with DISTINCT but a plain SUM would multiply.
        "   (SELECT SUM(tip) FROM memo_likes WHERE memo_likes.post_tx_hash = memo_posts.tx_hash) AS tip_total, " +
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
    const tables = PostRows()
    let allLikes = []
    for (let i = 0; i < allPosts.length; i++) {
        const post = allPosts[i]
        tables.posts.add(post.tx_hash, [post.lock.address, post.text, post.tx_hash])
        if (!post.likes) {
            continue
        }
        for (let j = 0; j < post.likes.length; j++) {
            post.likes[j].post_tx_hash = post.tx_hash
            allLikes.push(post.likes[j])
        }
    }
    for (let i = 0; i < parentChildren.length; i++) {
        tables.replies.add(parentChildren[i].parent + "-" + parentChildren[i].child,
            [parentChildren[i].parent, parentChildren[i].child])
    }
    for (let i = 0; i < allLikes.length; i++) {
        tables.likes.add(allLikes[i].tx_hash,
            [allLikes[i].lock.address, allLikes[i].tx_hash, allLikes[i].post_tx_hash, allLikes[i].tip])
    }
    await InsertBatch(conf, "memo_posts", Statements(tables))
    // The posts' own transactions ahead of the likes', which is the order they
    // were saved in when each went out as its own call.
    await SaveTransactions(conf, [...allPosts.map(post => post.tx), ...allLikes.map(like => like.tx)])
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
