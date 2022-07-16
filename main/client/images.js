const AttachImagesToProfiles = async (profiles) => {
    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i]
        if (!profile.pic) {
            continue
        }
        // TODO: Only get picture if not in DB already
        const response = await fetch(profile.pic.pic)
        profile.pic.data = Buffer.from(await (await response.blob()).arrayBuffer())
        console.log(profile.pic.data.toString("base64"))
    }
}

module.exports = {
    AttachImagesToProfiles,
}
