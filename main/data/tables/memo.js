const {Select, Insert} = require("../sqlite");
const {SaveTransactions} = require("./txs");
const {SaveMemoPosts} = require("./memo_post");
const {MaxFollows} = require("../common/memo_follow");

const GetProfileInfo = async (conf, addresses) => {
    const maxFollowersWhere = "follow_address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const maxFollowingWhere = "address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   profiles.address, " +
        "   profile_names.name AS name, " +
        "   profile_texts.profile AS profile, " +
        "   profile_pics.pic AS pic, " +
        "   COUNT(DISTINCT max_followers.tx_hash) AS num_followers, " +
        "   COUNT(DISTINCT max_following.tx_hash) AS num_following " +
        "FROM profiles " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN profile_texts ON (profile_texts.tx_hash = profiles.profile) " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN (" + MaxFollows(maxFollowersWhere) + ") max_followers " +
        "   ON (max_followers.follow_address = profiles.address) " +
        "LEFT JOIN (" + MaxFollows(maxFollowingWhere) + ") max_following " +
        "   ON (max_following.address = profiles.address) " +
        "WHERE profiles.address IN (" + Array(addresses.length).fill("?").join(", ") + ") "
    const results = await Select(conf, "profiles", query, [...addresses, ...addresses, ...addresses])
    if(!results[0].address){
        results[0].address = addresses[0]
    }
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

const SaveMemoProfiles = async (conf, profiles) => {
    let saveProfiles = []
    for (let i = 0; i < profiles.length; i++) {
        let {lock, name, profile, pic, following, followers, posts} = profiles[i]
        if (!lock || !lock.address || (!name && !profile && !pic)) {
            continue
        }
        saveProfiles.push({lock, name, profile, pic})
        if (name) {
            await Insert(conf, "profile_names",
                "INSERT OR REPLACE INTO profile_names (address, name, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, name.name, name.tx_hash])
        }
        if (profile) {
            await Insert(conf, "profile_texts",
                "INSERT OR REPLACE INTO profile_texts (address, profile, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, profile.text, profile.tx_hash])
        }
        if (pic) {
            await Insert(conf, "profile_pics",
                "INSERT OR REPLACE INTO profile_pics (address, pic, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, pic.pic, pic.tx_hash])
        }
        if (following && following.length) {
            await Insert(conf, "memo_follows-following",
                "INSERT OR REPLACE INTO memo_follows (address, follow_address, unfollow, tx_hash) " +
                "VALUES " + Array(following.length).fill("(?, ?, ?, ?)").join(", "), following.map(follow => [
                    lock.address, follow.follow_lock.address, follow.unfollow ? 1 : 0, follow.tx_hash]).flat())
            const followingProfiles = following.map(follow => {
                follow.follow_lock.profile.lock = {address: follow.follow_lock.address}
                return follow.follow_lock.profile
            })
            await SaveMemoProfiles(conf, followingProfiles)
            await SaveTransactions(conf, following.map(follow => {
                return follow.tx
            }))
        }
        if (followers && followers.length) {
            await Insert(conf, "memo_follows-followers",
                "INSERT OR REPLACE INTO memo_follows (address, follow_address, unfollow, tx_hash) " +
                "VALUES " + Array(followers.length).fill("(?, ?, ?, ?)").join(", "), followers.map(follow => [
                    follow.lock.address, lock.address, follow.unfollow ? 1 : 0, follow.tx_hash]).flat())
            const followersProfiles = followers.map(follow => {
                follow.lock.profile.lock = {address: follow.lock.address}
                return follow.lock.profile
            })
            await SaveMemoProfiles(conf, followersProfiles)
            await SaveTransactions(conf, followers.map(follow => {
                return follow.tx
            }))
        }
        if (posts && posts.length) {
            for (let i = 0; i < posts.length; i++) {
                posts[i].lock = lock
            }
            await SaveMemoPosts(conf, posts)
        }
    }
    if (!saveProfiles.length) {
        return
    }
    const query = "" +
        "INSERT OR REPLACE INTO profiles " +
        "   (address, name, profile, pic) " +
        "VALUES " + Array(saveProfiles.length).fill("(?, ?, ?, ?)").join(", ")
    const values = saveProfiles.map(profile => [
        profile.lock.address,
        profile.name ? profile.name.tx_hash : "",
        profile.profile ? profile.profile.tx_hash : "",
        profile.pic ? profile.pic.tx_hash : "",
    ]).flat()
    await Insert(conf, "profiles", query, values)
}

const GetRecentSetName = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   profile_names.*, " +
        "   block_txs.block_hash AS block_hash " +
        "FROM profiles " +
        "LEFT JOIN profile_names ON (profile_names.tx_hash = profiles.name) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = profiles.name) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE profiles.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "ORDER BY COALESCE(blocks.height, 1000000) DESC, profile_names.tx_hash ASC " +
        "LIMIT 1"
    const results = await Select(conf, "recent-set-name", query, addresses)
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

const GetRecentSetProfile = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   profile_texts.*, " +
        "   block_txs.block_hash AS block_hash " +
        "FROM profiles " +
        "LEFT JOIN profile_texts ON (profile_texts.tx_hash = profiles.profile) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = profiles.profile) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE profiles.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "ORDER BY COALESCE(blocks.height, 1000000) DESC, profile_texts.tx_hash ASC " +
        "LIMIT 1"
    const results = await Select(conf, "recent-set-profile", query, addresses)
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

const GetRecentSetPic = async (conf, addresses) => {
    const query = "" +
        "SELECT " +
        "   profile_pics.*, " +
        "   block_txs.block_hash AS block_hash " +
        "FROM profiles " +
        "LEFT JOIN profile_pics ON (profile_pics.tx_hash = profiles.pic) " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = profiles.pic) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "WHERE profiles.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "ORDER BY COALESCE(blocks.height, 1000000) DESC, profile_pics.tx_hash ASC " +
        "LIMIT 1"
    const results = await Select(conf, "recent-set-pic", query, addresses)
    if (!results || !results.length) {
        return undefined
    }
    return results[0]
}

const GetPicsExist = async (conf, urls) => {
    const query = "" +
        "SELECT " +
        "   urls " +
        "FROM images " +
        "WHERE urls IN (" + Array(urls.length).fill("?").join(", ") + ") "
    return await Select(conf, "images-exists-multi", query, urls)
}

const GetPicExists = async (conf, url) => {
    const query = "" +
        "SELECT " +
        "   url " +
        "FROM images " +
        "WHERE url = ?"
    const results = await Select(conf, "images-exists", query, [url])
    return results && results.length
}

const GetPic = async (conf, url) => {
    const query = "" +
        "SELECT " +
        "   data " +
        "FROM images " +
        "WHERE url = ?"
    const results = await Select(conf, "images-get", query, [url])
    if (!results || !results.length) {
        return undefined
    }
    return results[0].data
}

const SavePic = async (conf, url, data) => {
    const query = "" +
        "INSERT OR REPLACE " +
        "INTO images (url, data) " +
        "VALUES (?, ?)"
    await Insert(conf, "images", query, [url, data])
}

module.exports = {
    GetProfileInfo,
    SaveMemoProfiles,
    GetRecentSetName,
    GetRecentSetProfile,
    GetRecentSetPic,
    GetPicsExist,
    GetPicExists,
    SavePic,
    GetPic,
}
