const {Insert, Select} = require("../sqlite")
const {SaveMemoPosts} = require("./memo_post");
const {SaveTransactions} = require("./txs");
const {MaxChatRoomFollows} = require("../common/memo_follow");

const GetChatFollows = async ({conf, addresses}) => {
    const maxFollowsWhere = "address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   memo_chat_follow.address, " +
        "   memo_chat_follow.room, " +
        "   memo_chat_follow.unfollow, " +
        "   memo_chat_follow.tx_hash, " +
        "   max_follows.timestamp " +
        "FROM memo_chat_follow " +
        "JOIN (" + MaxChatRoomFollows(maxFollowsWhere) +
        ") max_follows ON (max_follows.tx_hash = memo_chat_follow.tx_hash) " +
        "WHERE max_follows.unfollow = 0 " +
        "ORDER BY max_follows.timestamp DESC " +
        "LIMIT 50 "
    return await Select(conf, "chat_room_follow", query, addresses)
}

const GetRecentRoomFollow = async (conf, addresses, room) => {
    const query = "" +
        "SELECT " +
        "   memo_chat_follow.*, " +
        "   block_txs.block_hash AS block_hash " +
        "FROM memo_chat_follow " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = memo_chat_follow.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE memo_chat_follow.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND memo_chat_follow.room = ? " +
        "ORDER BY COALESCE(blocks.height, 1000000) DESC, memo_chat_follow.tx_hash ASC " +
        "LIMIT 1"
    const results = await Select(conf, "recent-room-follow", query, [...addresses, room])
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

const GetRoomFollowCount = async ({conf, room}) => {
    const maxFollowsWhere = "room = ? "
    const query = "" +
        "SELECT " +
        "   COUNT(1) AS count " +
        "FROM memo_chat_follow " +
        "JOIN (" + MaxChatRoomFollows(maxFollowsWhere) +
        ") max_follows ON (max_follows.tx_hash = memo_chat_follow.tx_hash) " +
        "WHERE max_follows.unfollow = 0 "
    return await Select(conf, "chat_room_follow-count", query, [room])
}

const GetAddressesRoomFollowCount = async ({conf, addresses}) => {
    const maxFollowsWhere = "address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   COUNT(1) AS count " +
        "FROM memo_chat_follow " +
        "JOIN (" + MaxChatRoomFollows(maxFollowsWhere) +
        ") max_follows ON (max_follows.tx_hash = memo_chat_follow.tx_hash) " +
        "WHERE max_follows.unfollow = 0 "
    return await Select(conf, "chat_room_follow-addresses-count", query, addresses)
}

const GetRoomFollows = async ({conf, room}) => {
    const maxFollowsWhere = "room = ? "
    const query = "" +
        "SELECT " +
        "   memo_chat_follow.address, " +
        "   memo_chat_follow.room, " +
        "   memo_chat_follow.unfollow, " +
        "   memo_chat_follow.tx_hash, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data, " +
        "   max_follows.timestamp " +
        "FROM memo_chat_follow " +
        "JOIN (" + MaxChatRoomFollows(maxFollowsWhere) +
        ") max_follows ON (max_follows.tx_hash = memo_chat_follow.tx_hash) " +
        "LEFT JOIN profiles ON (profiles.address = memo_chat_follow.address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE max_follows.unfollow = 0 " +
        "ORDER BY max_follows.timestamp DESC " +
        "LIMIT 50 "
    return await Select(conf, "chat_room_follow_by_room", query, [room])
}

const SaveChatRoom = async (conf, room) => {
    if (!room.posts || room.posts.length === 0) {
        return
    }
    await SaveMemoPosts(conf, room.posts)
    const query = "" +
        "INSERT OR REPLACE INTO memo_chat_post (tx_hash, room) " +
        "VALUES " + Array(room.posts.length).fill("(?, ?)").join(", ")
    await Insert(conf, "chat_room", query, room.posts.map(post => [post.tx_hash, room.name]).flat())
}

const SaveChatRoomFollows = async (conf, roomFollows) => {
    if (!roomFollows || roomFollows.length === 0) {
        return
    }
    const query = "" +
        "INSERT OR REPLACE INTO memo_chat_follow (address, room, unfollow, tx_hash) " +
        "VALUES " + Array(roomFollows.length).fill("(?, ?, ?, ?)").join(", ")
    await Insert(conf, "chat_room_follow", query, roomFollows.map(roomFollow =>
        [roomFollow.lock.address, roomFollow.name, roomFollow.unfollow ? 1 : 0, roomFollow.tx_hash]).flat())
    await SaveTransactions(conf, roomFollows.map(roomFollow => roomFollow.tx))
}

module.exports = {
    GetAddressesRoomFollowCount,
    GetChatFollows,
    GetRecentRoomFollow,
    GetRoomFollowCount,
    GetRoomFollows,
    SaveChatRoom,
    SaveChatRoomFollows,
}
