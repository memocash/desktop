const {Select} = require("../sqlite")

const GetFollowing = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   follow_address," +
        "   tx_hash," +
        "   unfollow " +
        "FROM memo_follow " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ")" //+
    //"   AND unfollow = 0 "
    return await Select(query, addresses)
}

module.exports = {
    GetFollowing,
}
