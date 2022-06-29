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

const SaveMemoProfiles = async (profiles) => {
    const query = "" +
        "INSERT OR REPLACE INTO profiles " +
        "   (address, name, profile, image) " +
        "VALUES (" + Array(profiles.length).fill("(?, ?, ?, ?)").join(", ") + ")"
    const values = profiles.map(profile => [profile.address, profile.name, profile.profile, profile.image]).flat()
    await Select(query, values)
}

module.exports = {
    GetProfileInfo,
    SaveMemoProfiles,
}
