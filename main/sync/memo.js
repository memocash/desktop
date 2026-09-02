const {GraphQL} = require("../client/graphql")
const {GetLinkedAddresses, SaveMemoProfiles} = require("../data/tables")
const {SaveImagesFromProfiles} = require("../client/images")
const {ProfileFields, TxQuery, TxTimeQuery} = require("./fields")

// Index defaults profile collections to 100 rows and caps requests at 5000.
// Posts only need the 50 rows the local list can display; follow graphs retain
// the server's standard page size while making the sync bound explicit.
const ProfilePostLimit = 50
const ProfileFollowLimit = 100

// Critical info first: name/profile/pic alone is tiny (~500 bytes) and lets the
// header render immediately, instead of waiting on the much heavier query below.
const HeaderQuery = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            ${ProfileFields}
        }
    }
    `

// Posts intentionally omit likes/parent/replies and the heavy fields of tx
// (raw/inputs/outputs/blocks) here: the local post list is only ever displayed
// 50 at a time (see GetPosts' LIMIT 50), and the posts backfill fetches that
// full detail for the visible set right after this resolves. Embedding it here
// too was the main source of multi-megabyte profile fetches for prolific
// posters. `tx.seen` alone IS kept (tiny) because GetPosts orders locally by
// timestamp, which comes from tx_seens/blocks rows populated by SaveTransactions
// — without it, freshly-synced posts have no local timestamp, sort as NULL
// (smaller than everything), and lose out to any stale-but-timestamped rows
// already cached from a previous full sync, surfacing old posts instead of new.
// Following/followers keep their nested profile since FollowList shows
// names/pics with no separate per-row fetch mechanism.
const DetailsQuery = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            ${ProfileFields}
            posts(newest: true, limit: ${ProfilePostLimit}) {
                tx_hash
                text
                tx {
                    hash
                    seen
                }
            }
            following(limit: ${ProfileFollowLimit}) {
                tx_hash
                unfollow
                ${TxQuery}
                follow_lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
            }
            followers(limit: ${ProfileFollowLimit}) {
                tx_hash
                unfollow
                ${TxQuery}
                lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
            }
        }
    }
    `

const LinksQuery = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            links {
                tx_hash
                address
                parent_address
                message
                ${TxTimeQuery}
                accepts {
                    tx_hash
                    request_tx_hash
                    message
                    ${TxTimeQuery}
                    revokes {
                        tx_hash
                        accept_tx_hash
                        message
                        ${TxTimeQuery}
                    }
                }
            }
        }
    }
    `

const ProfilesSubscription = `
    subscription($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            name {
                name
                tx_hash
            }
            profile {
                text
                tx_hash
            }
            pic {
                pic
                tx_hash
            }
            following {
                tx_hash
                unfollow
                follow_lock {
                    address
                    profile {
                        name {
                            name
                            tx_hash
                        }
                        pic {
                            pic
                            tx_hash
                        }
                    }
                }
            }
            followers {
                tx_hash
                unfollow
                lock {
                    address
                    profile {
                        name {
                            name
                            tx_hash
                        }
                        pic {
                            pic
                            tx_hash
                        }
                    }
                }
            }
        }
    }
    `

// Every profile whose pic a set of profiles shows: their own, and those of the
// people they follow and are followed by, which the follow lists render.
const profilesWithPics = (profiles) => profiles
    .concat(profiles.map(profile => profile.following ?
        profile.following.map(follow => follow.follow_lock.profile) : []).flat())
    .concat(profiles.map(profile => profile.followers ?
        profile.followers.map(follow => follow.lock.profile) : []).flat())

// Pics are downloaded one at a time, so they run after the profile rows are
// readable, and each profile is caught on its own inside.
const saveImages = (conf, profiles) => SaveImagesFromProfiles(conf, profilesWithPics(profiles))

// The header (name, profile text, pic) or the details (posts, follows) of a
// set of profiles. Only the header phase saves images: both queries request
// the same ProfileFields, so saving from both would race two concurrent
// check-then-fetch-then-save calls against the same not-yet-cached pic URL
// and download it twice. Returns how many profiles the index answered with.
const SyncProfiles = async ({conf, addresses, details, graphQL = GraphQL}) => {
    const data = await graphQL({network: conf, query: details ? DetailsQuery : HeaderQuery,
        variables: {addresses}})
    const profiles = data.data.profiles || []
    await SaveMemoProfiles(conf, profiles)
    if (!details) {
        await saveImages(conf, profiles)
    }
    return profiles.length
}

// Syncs link requests/accepts/revokes for the whole historical linked-address
// cluster of a set of addresses (a viewed profile, or all of a wallet's
// addresses) and returns the cluster. A profile's links cover both directions
// - requests the address signed and requests naming it as parent, each with
// its accepts and revokes nested - but not the links of the addresses on the
// far end of those, so a cluster more than one hop deep can't be resolved in
// one pass: alternate fetch-and-save with local GetLinkedAddresses until it
// stops growing. Every fetched profile's link data is saved locally, so the
// cluster still resolves from the local db when offline. Revoked edges remain
// in this cluster because their pre-revoke records remain part of the
// identity; readers enforce the revoke timestamp as a cutoff.
const SyncProfileLinks = async ({conf, addresses, graphQL = GraphQL}) => {
    if (!addresses || !addresses.length) {
        return []
    }
    const synced = new Set()
    let frontier = [...new Set(addresses)]
    for (let i = 0; i < 5 && frontier.length; i++) {
        const data = await graphQL({network: conf, query: LinksQuery, variables: {addresses: frontier}})
        frontier.forEach(frontierAddress => synced.add(frontierAddress))
        const profiles = data.data.profiles || []
        await SaveMemoProfiles(conf, profiles)
        const candidates = new Set()
        for (const profile of profiles) {
            for (const link of profile.links || []) {
                candidates.add(link.address)
                candidates.add(link.parent_address)
            }
        }
        const linked = await GetLinkedAddresses(conf, addresses)
        frontier = [...new Set([...linked, ...candidates])].filter(
            candidate => !synced.has(candidate))
    }
    return GetLinkedAddresses(conf, addresses)
}

// Syncs both the historical link graph and the profile fields reachable
// through it. Feed and chat payloads only embed the posting address's profile,
// so this supplies fields inherited from an older, revoked child address.
const SyncLinkedProfiles = async ({conf, addresses, graphQL = GraphQL}) => {
    const linked = await SyncProfileLinks({conf, addresses, graphQL})
    if (!linked.length) {
        return linked
    }
    const data = await graphQL({network: conf, query: HeaderQuery, variables: {addresses: linked}})
    const profiles = data.data.profiles || []
    await SaveMemoProfiles(conf, profiles)
    await saveImages(conf, profiles)
    return linked
}

// A profile change pushed by the subscription. forward is called twice: once
// the rows are readable, and again once the pic has been fetched, so the page
// shows the name change without waiting on the download.
const SaveNewProfile = async ({conf, profile, forward}) => {
    await SaveMemoProfiles(conf, [profile])
    forward()
    await saveImages(conf, [profile])
    forward()
}

module.exports = {
    HeaderQuery,
    ProfilesSubscription,
    SaveNewProfile,
    SyncLinkedProfiles,
    SyncProfileLinks,
    SyncProfiles,
    saveImages,
}
