const {Select, Insert} = require("../sqlite");
const {SaveTransactions} = require("./txs");
const {SaveMemoPosts} = require("./memo_post");
const {MaxFollows} = require("../common/memo_follow");

const txTimestamp = (hash) => "COALESCE(" +
    "(SELECT MIN(blocks.timestamp) FROM block_txs JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
    "WHERE block_txs.tx_hash = " + hash + "), " +
    "(SELECT tx_seens.timestamp FROM tx_seens WHERE tx_seens.hash = " + hash + "))"

// A child address contributes records through a revoked link only up to the
// first revoke. The parent remains the continuing identity, so a revoke does
// not impose a cutoff on records authored by the parent itself.
const addressCutoff = (address) => "(" +
    "SELECT MIN(" + txTimestamp("link_revokes.tx_hash") + ") " +
    "FROM link_requests " +
    "JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
    "JOIN link_revokes ON (link_revokes.accept_tx_hash = link_accepts.tx_hash) " +
    "WHERE link_requests.address = " + address + " " +
    "AND NOT EXISTS (" +
    "   SELECT 1 FROM link_accepts active_accept " +
    "   LEFT JOIN link_revokes active_revoke ON (active_revoke.accept_tx_hash = active_accept.tx_hash) " +
    "   WHERE active_accept.request_tx_hash = link_requests.tx_hash " +
    "   AND active_revoke.tx_hash IS NULL" +
    "))"

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
        "   " + txTimestamp("profiles.name") + " AS name_timestamp, " +
        "   " + txTimestamp("profiles.profile") + " AS profile_timestamp, " +
        "   " + txTimestamp("profiles.pic") + " AS pic_timestamp, " +
        "   " + addressCutoff("profiles.address") + " AS link_cutoff, " +
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
        if (!merged.name && row.name && (!row.link_cutoff || !row.name_timestamp ||
            row.name_timestamp <= row.link_cutoff)) {
            merged.name = row.name
        }
        if (!merged.profile && row.profile && (!row.link_cutoff || !row.profile_timestamp ||
            row.profile_timestamp <= row.link_cutoff)) {
            merged.profile = row.profile
        }
        if (!merged.pic && row.pic && (!row.link_cutoff || !row.pic_timestamp ||
            row.pic_timestamp <= row.link_cutoff)) {
            merged.pic = row.pic
        }
    }
    const aliases = await GetAddressAliases(conf, addresses)
    const viewedAlias = aliases.find(alias => alias.target_address === addresses[0])
    merged.alias = viewedAlias ? viewedAlias.alias : null
    return merged
}

// Links arrive from the server nested under the request they belong to: a
// profile returns the requests it is party to in either direction, each with
// the accepts signed by the request's parent, each of those with the revokes
// signed by either side. That nesting is the only record of who signed an
// accept or a revoke, so the rows are stored keyed to what they reference and
// the queries below rely on it rather than re-checking addresses.
const SaveProfileLinks = async (conf, links) => {
    if (!links || !links.length) {
        return
    }
    await Insert(conf, "link_requests",
        "INSERT OR REPLACE INTO link_requests (tx_hash, address, parent_address, message) " +
        "VALUES " + Array(links.length).fill("(?, ?, ?, ?)").join(", "),
        links.map(link => [link.tx_hash, link.address, link.parent_address, link.message]).flat())
    await SaveTransactions(conf, links.map(link => link.tx))
    const accepts = links.map(link => link.accepts || []).flat()
    if (accepts.length) {
        await Insert(conf, "link_accepts",
            "INSERT OR REPLACE INTO link_accepts (tx_hash, request_tx_hash, message) " +
            "VALUES " + Array(accepts.length).fill("(?, ?, ?)").join(", "),
            accepts.map(accept => [accept.tx_hash, accept.request_tx_hash, accept.message]).flat())
        await SaveTransactions(conf, accepts.map(accept => accept.tx))
    }
    const revokes = accepts.map(accept => accept.revokes || []).flat()
    if (revokes.length) {
        await Insert(conf, "link_revokes",
            "INSERT OR REPLACE INTO link_revokes (tx_hash, accept_tx_hash, message) " +
            "VALUES " + Array(revokes.length).fill("(?, ?, ?)").join(", "),
            revokes.map(revoke => [revoke.tx_hash, revoke.accept_tx_hash, revoke.message]).flat())
        await SaveTransactions(conf, revokes.map(revoke => revoke.tx))
    }
}

// Expands a set of addresses through every accepted link, including historical
// links. Revocation is a time boundary for the child address's records; it does
// not erase the relationship or records that predate the revoke.
const GetLinkedAddresses = async (conf, addresses) => {
    let cluster = [...new Set(addresses)]
    for (let i = 0; i < 10; i++) {
        const inList = "(" + Array(cluster.length).fill("?").join(", ") + ") "
        const query = "" +
            "SELECT " +
            "   link_requests.address AS child_address, " +
            "   link_requests.parent_address AS parent_address " +
            "FROM link_requests " +
            "JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
            "WHERE link_requests.address IN " + inList + "OR link_requests.parent_address IN " + inList
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
        "LEFT JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "LEFT JOIN link_revokes ON (link_revokes.accept_tx_hash = link_accepts.tx_hash) " +
        "WHERE (link_requests.address IN " + userIn + "AND link_requests.parent_address IN " + viewedIn + ") " +
        "   OR (link_requests.parent_address IN " + userIn + "AND link_requests.address IN " + viewedIn + ")"
    return await Select(conf, "profile-links", query,
        [...userAddresses, ...addresses, ...userAddresses, ...addresses])
}

// Every link row touching any of the given addresses, with the display names
// of both sides when known. Same request/accept/revoke row semantics as
// GetProfileLinks.
const GetWalletLinks = async (conf, addresses) => {
    const inList = "(" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT " +
        "   link_requests.tx_hash AS request_tx_hash, " +
        "   link_requests.address AS child_address, " +
        "   link_requests.parent_address AS parent_address, " +
        "   link_requests.message AS message, " +
        "   link_accepts.tx_hash AS accept_tx_hash, " +
        "   (CASE WHEN link_revokes.tx_hash IS NULL THEN 0 ELSE 1 END) AS revoked, " +
        "   child_names.name AS child_name, " +
        "   parent_names.name AS parent_name " +
        "FROM link_requests " +
        "LEFT JOIN link_accepts ON (link_accepts.request_tx_hash = link_requests.tx_hash) " +
        "LEFT JOIN link_revokes ON (link_revokes.accept_tx_hash = link_accepts.tx_hash) " +
        "LEFT JOIN profiles child_profiles ON (child_profiles.address = link_requests.address) " +
        "LEFT JOIN profile_names child_names ON (child_names.tx_hash = child_profiles.name) " +
        "LEFT JOIN profiles parent_profiles ON (parent_profiles.address = link_requests.parent_address) " +
        "LEFT JOIN profile_names parent_names ON (parent_names.tx_hash = parent_profiles.name) " +
        "WHERE link_requests.address IN " + inList + "OR link_requests.parent_address IN " + inList
    return await Select(conf, "wallet-links", query, [...addresses, ...addresses])
}

const SaveAddressAliases = async (conf, aliases) => {
    if (!aliases || !aliases.length) {
        return
    }
    await Insert(conf, "address-aliases",
        "INSERT OR REPLACE INTO address_aliases (tx_hash, address, target_address, alias) VALUES " +
        Array(aliases.length).fill("(?, ?, ?, ?)").join(", "), aliases.map(value => [
            value.tx_hash, value.address, value.target_address, value.alias]).flat())
}

// Aliases are meaningful within the identity that set them. Only aliases
// signed by an address in the resolved cluster are returned, newest first per
// target address (unconfirmed aliases sort ahead of confirmed ones).
const GetAddressAliases = async (conf, addresses) => {
    const inList = "(" + Array(addresses.length).fill("?").join(", ") + ") "
    const query = "" +
        "SELECT address_aliases.* FROM address_aliases " +
        "LEFT JOIN block_txs ON (block_txs.tx_hash = address_aliases.tx_hash) " +
        "LEFT JOIN blocks ON (blocks.hash = block_txs.block_hash) " +
        "LEFT JOIN tx_seens ON (tx_seens.hash = address_aliases.tx_hash) " +
        "WHERE address_aliases.address IN " + inList +
        "AND address_aliases.target_address IN " + inList +
        "ORDER BY COALESCE(blocks.height, 1000000000) DESC, " +
        "COALESCE(tx_seens.timestamp, blocks.timestamp) DESC, address_aliases.tx_hash DESC"
    const rows = await Select(conf, "address-aliases", query, [...addresses, ...addresses])
    const aliases = {}
    for (const row of rows) {
        if (!aliases[row.target_address]) {
            aliases[row.target_address] = row
        }
    }
    return Object.values(aliases)
}

const SaveMemoProfiles = async (conf, profiles) => {
    let saveProfiles = []
    for (let i = 0; i < profiles.length; i++) {
        let {lock, name, profile, pic, following, followers, posts, links} = profiles[i]
        if (!lock || !lock.address) {
            continue
        }
        // Link data is saved before the profile-fields guard below: an address
        // that only ever linked itself (e.g. a fresh parent address) has no
        // name/profile/pic but its links still need to resolve.
        await SaveProfileLinks(conf, links)
        // Posts belong to an address even when that address has never set a
        // name, profile text, or picture. This is common for a newly linked
        // child address, and skipping here would keep its posts out of both
        // sides of the merged profile.
        if (posts && posts.length) {
            for (let i = 0; i < posts.length; i++) {
                posts[i].lock = lock
            }
            await SaveMemoPosts(conf, posts)
        }
        if (!name && !profile && !pic) {
            continue
        }
        saveProfiles.push({lock, name, profile, pic})
        if (name) {
            await Insert(conf, "profile_names",
                "INSERT OR REPLACE INTO profile_names (address, name, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, name.name, name.tx_hash])
            await SaveTransactions(conf, [name.tx])
        }
        if (profile) {
            await Insert(conf, "profile_texts",
                "INSERT OR REPLACE INTO profile_texts (address, profile, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, profile.text, profile.tx_hash])
            await SaveTransactions(conf, [profile.tx])
        }
        if (pic) {
            await Insert(conf, "profile_pics",
                "INSERT OR REPLACE INTO profile_pics (address, pic, tx_hash) VALUES (?, ?, ?)", [
                    lock.address, pic.pic, pic.tx_hash])
            await SaveTransactions(conf, [pic.tx])
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
    GetAddressAliases,
    GetLinkedAddresses,
    GetProfileInfo,
    GetProfileLinks,
    GetWalletLinks,
    SaveMemoProfiles,
    SaveAddressAliases,
    GetRecentSetName,
    GetRecentSetProfile,
    GetRecentSetPic,
    GetPicsExist,
    GetPicExists,
    SavePic,
    GetPic,
}
