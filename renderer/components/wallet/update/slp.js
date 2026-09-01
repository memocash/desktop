import {BeginActivity, Plural} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";

// Token balances are shown on both of these tabs, and neither can be trusted
// until the pre-SLP transactions have been checked.
const SlpScopes = [Tabs.Tokens, Tabs.Coins]

// Asks main to check the transactions whose SLP verdict hasn't settled (see
// main/sync/slp.js). Main says how many it found once it has looked, and how
// many it checked; a run that found nothing ends without a closing line.
const UpdateSlp = async ({addresses, setLastUpdate, scopes = SlpScopes}) => {
    const activity = BeginActivity("Checking transactions for tokens", {scopes})
    let result
    try {
        result = await window.electron.syncSlp({addresses, onProgress: (progress) => {
            if (progress.unchecked !== undefined) {
                activity.log(`Checking ${Plural(progress.unchecked, "transaction")} for tokens`)
            }
        }})
    } catch (e) {
        activity.fail(e)
        throw e
    }
    if (result.error) {
        activity.fail(new Error(result.error))
        return
    }
    if (result.checked && typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
    activity.end(result.checked ? `Checked ${Plural(result.checked, "transaction")} for tokens` : undefined)
}

export default UpdateSlp
