const {Select} = require("../sqlite")

const GetFollowing = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_follow.follow_address," +
        "   memo_follow.tx_hash," +
        "   memo_follow.unfollow, " +
        "   profile_names.name, " +
        "   profile_pics.pic, " +
        "   images.data AS pic_data " +
        "FROM memo_follow " +
        "LEFT JOIN profiles ON (profiles.address = memo_follow.follow_address) " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN images ON (images.url = profile_pics.pic) " +
        "WHERE memo_follow.address IN (" + Array(addresses.length).fill("?").join(", ") + ")" //+
    //"   AND unfollow = 0 "
    return await Select(query, addresses)
}

module.exports = {
    GetFollowing,
}
