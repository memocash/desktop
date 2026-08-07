// The img src for a profile picture: the stored bytes as a data url, or the
// bundled default when the profile has none. One place so every profile
// rendering falls back the same way.
const ProfilePicSrc = (data) => (data && data.length) ?
    `data:image/png;base64,${Buffer.from(data).toString("base64")}` :
    "/default-profile.jpg"

export {ProfilePicSrc}
