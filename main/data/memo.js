const {Select, Insert} = require("./sqlite");

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
    let saveProfiles = []
    for (let i = 0; i < profiles.length; i++) {
        let {lock, name, profile, image} = profiles[i]
        if (!lock || !lock.address || !name) {
            continue
        }
        saveProfiles.push({lock, name, profile, image})
    }
    if (!saveProfiles.length) {
        return
    }
    const query = "" +
        "INSERT OR REPLACE INTO profiles " +
        "   (address, name, profile, image) " +
        "VALUES " + Array(saveProfiles.length).fill("(?, ?, ?, ?)").join(", ")
    const values = saveProfiles.map(profile => [profile.lock.address, profile.name, profile.profile, profile.image]).flat()
    await Insert(query, values)
}

module.exports = {
    GetProfileInfo,
    SaveMemoProfiles,
}
