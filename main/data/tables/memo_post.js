const {Select} = require("../sqlite");

const GetPosts = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   memo_posts.* " +
        "FROM memo_posts " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    return await Select(query, addresses)
}

module.exports = {
    GetPosts,
}
