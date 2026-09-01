import {Plural, TrackActivity} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";

const notifyUpdate = (setLastUpdate) => setLastUpdate((new Date()).toISOString())

// The header (name, profile text, pic) and the details (posts, follows) of a
// set of profiles are two requests main runs and stores (main/sync/memo.js).
// They are independent, so the two fire concurrently instead of one awaiting
// the other, and the header - being tiny - still lands and notifies first in
// the common case, keeping the "critical info first" progressive render.
// Each phase is caught and logged rather than left to reject, so a failure
// in either no longer aborts the other or the caller's subsequent steps; it
// just leaves that phase's data stale until the next sync.
const syncProfiles = async ({addresses, details, setLastUpdate}) => {
    const count = await window.electron.syncProfiles({addresses, details})
    notifyUpdate(setLastUpdate)
    return count
}

// scopes says which part of the app is waiting on this sync: the Memo tab for
// the wallet's own identity and its feed, the profile modal when it's the one
// asking (see modal/modals/profile/view), so opening a profile doesn't make the
// Memo tab look busy. Notifications are derived from the posts and follows this
// downloads, so that tab waits on it too.
const MemoScopes = [Tabs.Memo, Tabs.Notifications]

const UpdateMemoProfile = async ({addresses, setLastUpdate, scopes = MemoScopes}) =>
    await TrackActivity({
        start: `Updating ${Plural(addresses.length, "profile")}`,
        done: count => `Updated ${Plural(count, "profile")}`,
        scopes,
    }, () => syncProfiles({addresses, details: false, setLastUpdate}))

const UpdateMemoDetails = async ({addresses, setLastUpdate, scopes = MemoScopes}) =>
    await TrackActivity({
        start: `Loading posts and follows for ${Plural(addresses.length, "profile")}`,
        done: count => `Loaded posts and follows for ${Plural(count, "profile")}`,
        scopes,
    }, () => syncProfiles({addresses, details: true, setLastUpdate}))

const UpdateMemoHistory = async ({addresses, setLastUpdate, scopes = MemoScopes}) => {
    await Promise.all([
        UpdateMemoProfile({addresses, setLastUpdate, scopes})
            .catch(e => console.log("UpdateMemoHistory: header sync failed", e)),
        UpdateMemoDetails({addresses, setLastUpdate, scopes})
            .catch(e => console.log("UpdateMemoHistory: details sync failed", e)),
    ])
}

export {
    MemoScopes,
    UpdateMemoDetails,
    UpdateMemoProfile,
}
export default UpdateMemoHistory
