const {GetPicExists, SavePic} = require("../data/tables");
const SaveImagesFromProfiles = async (conf, profiles) => {
    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i]
        if (!profile.pic) {
            continue
        }
        const picExists = await GetPicExists(conf, profile.pic.pic)
        if (picExists) {
            continue
        }
        const response = await fetch(profile.pic.pic)
        profile.pic.data = Buffer.from(await (await response.blob()).arrayBuffer())
        await SavePic(conf, profile.pic.pic, profile.pic.data)
    }
}

module.exports = {
    SaveImagesFromProfiles: SaveImagesFromProfiles,
}
