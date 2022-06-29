const {Select} = require("./sqlite");

const GetProfileInfo = async (addresses) => {
    const query = "" +
        "SELECT " +
        "   name, " +
        "   profile, " +
        "   image " +
        "FROM profiles " +
        "WHERE address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const results = await Select(query, addresses)
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

module.exports = {
    GetProfileInfo,
}
