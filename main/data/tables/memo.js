const {Select, Insert} = require("../sqlite");
const {SaveTransactions} = require("./txs");
const {SaveMemoPosts} = require("./memo_post");
const {MaxFollows} = require("../common/memo_follow");

// Returns a single merged profile for a set of addresses (a wallet's addresses,
// or a linked-address cluster). Rows are grouped per address and merged in JS
// so name/profile/pic selection is deterministic: without the GROUP BY, SQLite
// picks the bare columns from an arbitrary row, which showed "Name not set"
// for a linked profile whenever the row picked happened to be a member that
// never set a name. Merge order follows the passed address order, so callers
// put the viewed address first - its own name wins over a linked member's.
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
        "WHERE profiles.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "GROUP BY profiles.address"
    const results = await Select(conf, "profiles", query, [...addresses, ...addresses, ...addresses])
    const merged = {
        address: addresses[0],
        name: null,
        profile: null,
        pic: null,
        num_followers: 0,
        num_following: 0,
    }
    const rowsByAddress = {}
    for (const row of results) {
        rowsByAddress[row.address] = row
    }
    for (const address of addresses) {
        const row = rowsByAddress[address]
        if (!row) {
            continue
        }
        merged.num_followers += row.num_followers
        merged.num_following += row.num_following
        if (!merged.name && row.name) {
            merged.name = row.name
        }
        if (!merged.profile && row.profile) {
            merged.profile = row.profile
        }
        if (!merged.pic && row.pic) {
            merged.pic = row.pic
        }
    }
    return merged
}

// Expands a set of addresses to every address transitively linked to it. A link
// is active when a request has an accept from the requested parent and that
// accept has no revoke from either side of the link (revoking a specific accept
// leaves a later re-accept of the same request active).
const GetLinkedAddresses = async (conf, addresses) => {
    let cluster = [...new Set(addresses)]
    for (let i = 0; i < 10; i++) {
        const inList = "(" + Array(cluster.length).fill("?").join(", ") + ") "
        const query = "" +
            "SELECT " +
            "   link_requests.address AS child_address, " +
            "   link_requests.parent_address AS parent_address " +
            "FROM link_requests " +
            "JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash " +
            "   AND link_accepts.address = link_requests.parent_address) " +
            "LEFT JOIN link_revokes ON (link_revokes.accept_tx_hash = link_accepts.tx_hash " +
            "   AND link_revokes.address IN (link_requests.address, link_requests.parent_address)) " +
            "WHERE link_revokes.tx_hash IS NULL " +
            "   AND (link_requests.address IN " + inList + "OR link_requests.parent_address IN " + inList + ")"
        const results = await Select(conf, "linked-addresses", query, [...cluster, ...cluster])
        const known = new Set(cluster)
        for (const row of results) {
            known.add(row.child_address)
            known.add(row.parent_address)
        }
        if (known.size === cluster.length) {
            break
        }
        cluster = [...cluster, ...[...known].filter(address => !cluster.includes(address))]
    }
    return cluster
}

// Link rows connecting a wallet's addresses to a viewed profile's cluster, in
// either direction (wallet as child or as parent). One row per request/accept
// pair; a request can appear in multiple rows when it has both a revoked and a
// later re-issued accept, so callers decide status per request across rows.
const GetProfileLinks = async (conf, {userAddresses, addresses}) => {
    const userIn = "(" + Array(userAddresses.length).fill("?").join(", ") + ") "
    const viewedIn = "(" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   link_requests.tx_hash AS request_tx_hash, " +
        "   link_requests.address AS child_address, " +
        "   link_requests.parent_address AS parent_address, " +
        "   link_accepts.tx_hash AS accept_tx_hash, " +
        "   (CASE WHEN link_revokes.tx_hash IS NULL THEN 0 ELSE 1 END) AS revoked " +
        "FROM link_requests " +
        "LEFT JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash " +
        "   AND link_accepts.address = link_requests.parent_address) " +
        "LEFT JOIN link_revokes ON (link_revokes.accept_tx_hash = link_accepts.tx_hash " +
        "   AND link_revokes.address IN (link_requests.address, link_requests.parent_address)) " +
        "WHERE (link_requests.address IN " + userIn + "AND link_requests.parent_address IN " + viewedIn + ") " +
        "   OR (link_requests.parent_address IN " + userIn + "AND link_requests.address IN " + viewedIn + ")"
    return await Select(conf, "profile-links", query,
        [...userAddresses, ...addresses, ...userAddresses, ...addresses])
}

const SaveMemoProfiles = async (conf, profiles) => {
    let saveProfiles = []
    for (let i = 0; i < profiles.length; i++) {
        let {lock, name, profile, pic, following, followers, posts, link_requests, link_accepts, link_revokes} =
            profiles[i]
        if (!lock || !lock.address) {
            continue
        }
        // Link data is saved before the profile-fields guard below: an address
        // that only ever linked itself (e.g. a fresh parent address) has no
        // name/profile/pic but its links still need to resolve.
        if (link_requests && link_requests.length) {
            await Insert(conf, "link_requests",
                "INSERT OR REPLACE INTO link_requests (tx_hash, address, parent_address, message) " +
                "VALUES " + Array(link_requests.length).fill("(?, ?, ?, ?)").join(", "),
                link_requests.map(request => [
                    request.tx_hash, request.address, request.parent_address, request.message]).flat())
        }
        if (link_accepts && link_accepts.length) {
            await Insert(conf, "link_accepts",
                "INSERT OR REPLACE INTO link_accepts (tx_hash, address, request_tx_hash, message) " +
                "VALUES " + Array(link_accepts.length).fill("(?, ?, ?, ?)").join(", "),
                link_accepts.map(accept => [
                    accept.tx_hash, accept.address, accept.request_tx_hash, accept.message]).flat())
        }
        if (link_revokes && link_revokes.length) {
            await Insert(conf, "link_revokes",
                "INSERT OR REPLACE INTO link_revokes (tx_hash, address, accept_tx_hash, message) " +
                "VALUES " + Array(link_revokes.length).fill("(?, ?, ?, ?)").join(", "),
                link_revokes.map(revoke => [
                    revoke.tx_hash, revoke.address, revoke.accept_tx_hash, revoke.message]).flat())
        }
        if (!name && !profile && !pic) {
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
    GetLinkedAddresses,
    GetProfileInfo,
    GetProfileLinks,
    SaveMemoProfiles,
    GetRecentSetName,
    GetRecentSetProfile,
    GetRecentSetPic,
    GetPicsExist,
    GetPicExists,
    SavePic,
    GetPic,
}
