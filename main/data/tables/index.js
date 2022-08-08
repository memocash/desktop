const {GetFollowing, GetFollowers, GetRecentFollow} = require("./memo_follow")
const {GetLikes} = require("./memo_like")
const {GetPost, GetPosts, GetPostParent, GetPostReplies} = require("./memo_post")
const {GetCoins} = require("./outputs")

module.exports = {
    GetFollowing,
    GetFollowers,
    GetLikes,
    GetRecentFollow,
    GetPost,
    GetPosts,
    GetPostParent,
    GetPostReplies,
    GetCoins,
}
