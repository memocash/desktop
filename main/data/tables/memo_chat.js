const {Insert} = require("../sqlite")
const {SaveMemoPosts} = require("./memo_post");
const {SaveTransactions} = require("./txs");

const SaveChatRoom = async (room) => {
    if (!room.posts || room.posts.length === 0) {
        return
    }
    await SaveMemoPosts(room.posts)
    const query = "" +
        "INSERT OR REPLACE INTO memo_chat_post (tx_hash, room) " +
        "VALUES " + Array(room.posts.length).fill("(?, ?)").join(", ")
    await Insert("chat_room", query, room.posts.map(post => [post.tx_hash, room.name]).flat())
}

const SaveChatRoomFollows = async (roomFollows) => {
    if (!roomFollows || roomFollows.length === 0) {
        return
    }
    const query = "" +
        "INSERT OR REPLACE INTO memo_chat_follow (address, room, unfollow, tx_hash) " +
        "VALUES " + Array(roomFollows.length).fill("(?, ?, ?, ?)").join(", ")
    await Insert("chat_room_follow", query, roomFollows.map(roomFollow =>
        [roomFollow.lock.address, roomFollow.name, roomFollow.unfollow ? 1 : 0, roomFollow.tx_hash]).flat())
    await SaveTransactions(roomFollows.map(roomFollow => roomFollow.tx))
}

module.exports = {
    SaveChatRoom,
    SaveChatRoomFollows,
}
