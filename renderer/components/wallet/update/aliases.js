import {MemoScopes} from "./memo";
import {Plural, TrackActivity} from "../../util/activity";

// Reads the alias transactions of a set of identity addresses in main (see
// main/sync/aliases.js) and returns the aliases now stored for them.
const SyncAliases = async ({addresses, scopes = MemoScopes}) => {
    if (!addresses || !addresses.length) {
        return []
    }
    return await TrackActivity({
        start: `Loading aliases for ${Plural(addresses.length, "address", "addresses")}`,
        done: aliases => `Loaded ${Plural(aliases.length, "alias", "aliases")}`,
        scopes,
    }, () => window.electron.syncAliases({addresses}))
}

export default SyncAliases
