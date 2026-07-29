const {GetPicExists, SavePic} = require("../data/tables");

// Magic bytes of the raster formats an <img> can decode. The renderer labels
// every cached pic "data:image/png" and lets the decoder sniff the real format,
// so anything here renders regardless of the declared type - but a response
// that is not one of these (an HTML error page, most often) renders as a broken
// image, which is exactly what we are filtering out.
const imageSignatures = [
    [0x89, 0x50, 0x4e, 0x47],   // png
    [0xff, 0xd8, 0xff],         // jpeg
    [0x47, 0x49, 0x46, 0x38],   // gif
    [0x42, 0x4d],               // bmp
]

const isImage = (data) => {
    // webp is "RIFF"<4 byte size>"WEBP", so it can't be matched by a prefix.
    if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" &&
        data.toString("ascii", 8, 12) === "WEBP") {
        return true
    }
    return imageSignatures.some(signature =>
        data.length >= signature.length && signature.every((byte, i) => data[i] === byte))
}

// Pic URLs are arbitrary user input written on chain years ago, so a large share
// of them no longer resolve. Failures are split in two so each is cached the way
// it should be:
//
// - A response that isn't an image is stored as an empty blob. Imgur (the most
//   common host here) answers a dead image with a 200 and its HTML homepage, so
//   the old code stored the markup as the pic and every render of that profile
//   produced a broken image that could never recover: the row's existence made
//   GetPicExists skip the re-download forever. An empty blob keeps that same
//   "don't ask again" property - the URL is dead, not slow - while the render
//   sites' length checks fall back to the default pic.
// - A network error or non-2xx status saves nothing, so the next sync retries.
//   Those are the transient cases, and leaving the row absent is what makes a
//   host that was merely down recoverable.
//
// Each profile is caught on its own because these run over whole follow graphs;
// one unreachable host must not abandon the pics queued behind it.
const SaveImagesFromProfiles = async (conf, profiles) => {
    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i]
        if (!profile.pic || !profile.pic.pic) {
            continue
        }
        const picExists = await GetPicExists(conf, profile.pic.pic)
        if (picExists) {
            continue
        }
        let data
        try {
            const response = await fetch(profile.pic.pic)
            if (!response.ok) {
                console.log("SaveImagesFromProfiles: pic status " + response.status +
                    " for " + profile.pic.pic)
                continue
            }
            data = Buffer.from(await (await response.blob()).arrayBuffer())
        } catch (e) {
            console.log("SaveImagesFromProfiles: pic download failed for " + profile.pic.pic, e)
            continue
        }
        if (!isImage(data)) {
            console.log("SaveImagesFromProfiles: pic is not an image, caching empty: " + profile.pic.pic)
            data = Buffer.alloc(0)
        }
        profile.pic.data = data
        await SavePic(conf, profile.pic.pic, data)
    }
}

module.exports = {
    SaveImagesFromProfiles: SaveImagesFromProfiles,
}
