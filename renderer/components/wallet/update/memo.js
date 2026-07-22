import {ProfileFields, TxQuery} from "../../util/graphql";

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
// 50 at a time (see GetPosts' LIMIT 50), and UpdatePosts already fetches that
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
            posts(newest: true, limit: 50) {
                tx_hash
                text
                tx {
                    hash
                    seen
                }
            }
            following {
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
            followers {
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

const notifyUpdate = (setLastUpdate) => setLastUpdate((new Date()).toISOString())

// Header and details are independent requests - firing them concurrently
// instead of awaiting one before starting the other saves a full network
// round-trip, and the header (being tiny) still lands and notifies first in
// the common case, so the "critical info first" progressive render is kept.
// Each phase is caught and logged rather than left to reject: before this
// query was split, a failed fetch meant nothing updated and callers (which
// have no error handling of their own) silently stopped; now a failure in
// either phase no longer aborts the other phase or the caller's subsequent
// steps (e.g. UpdatePosts backfill), it just leaves that phase's data stale
// until the next sync - the same degraded-but-safe outcome as before,
// instead of a new partial-update inconsistency.
// Only the header phase saves images: both queries request the same
// ProfileFields (name/profile/pic), so saving from both would race two
// concurrent check-then-fetch-then-save calls in SaveImagesFromProfiles
// against the same not-yet-cached pic URL and download it twice.
const syncProfiles = async ({query, addresses, setLastUpdate, saveImages}) => {
    const data = await window.electron.graphQL(query, {addresses})
    await window.electron.saveMemoProfiles(data.data.profiles)
    if (saveImages) {
        await window.electron.saveMemoProfileImages(data.data.profiles)
    }
    notifyUpdate(setLastUpdate)
}

const UpdateMemoHistory = async ({addresses, setLastUpdate}) => {
    await Promise.all([
        syncProfiles({query: HeaderQuery, addresses, setLastUpdate, saveImages: true})
            .catch(e => console.log("UpdateMemoHistory: header sync failed", e)),
        syncProfiles({query: DetailsQuery, addresses, setLastUpdate, saveImages: false})
            .catch(e => console.log("UpdateMemoHistory: details sync failed", e)),
    ])
}

export default UpdateMemoHistory
