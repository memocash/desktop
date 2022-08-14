const {Insert, Select} = require("../sqlite")
const {SaveMemoPosts} = require("./memo_post");

const SaveChatRoom = async (room) => {
    if (!room.posts || room.posts.length === 0) {
        return
    }
    await SaveMemoPosts(room.posts)
    const query = "" +
        "INSERT OR IGNORE INTO memo_chat_post (tx_hash, room) " +
        "VALUES " + Array(room.posts.length).fill("(?, ?)").join(", ")
    await Insert("chat_room", query, room.posts.map(post => [post.tx_hash, room.name]).flat())
}

const GetRoomPosts = async (room) => {
    const query = "" +
        "SELECT * FROM memo_chat_post " +
        "WHERE room = ? "
    return await Select("chat_room", query, [room])
}

module.exports = {
    SaveChatRoom,
    GetRoomPosts,
}
