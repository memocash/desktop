import {Status} from "../../util/connect"
import {BeginActivity, Plural} from "../../util/activity"
import {Tabs} from "../../../../main/common/util"

// Transactions feed every balance the wallet shows, so a history sync marks all
// of those tabs as busy - each of them is showing a number that's about to
// change, or nothing at all until this lands. Notifications included: payments
// and token transfers are notifications, derived from these same rows.
const HistoryScopes = [Tabs.History, Tabs.Coins, Tabs.Addresses, Tabs.Tokens, Tabs.Send, Tabs.Notifications]

// The download itself runs in main (main/sync/history.js): this asks for it,
// turns its progress into activity lines and re-renders, and reports how it
// ended. An index failure part-way is a disconnect, not a thrown error, the
// way it always was - whatever main saved before it is already in the
// database.
const UpdateHistory = async ({wallet, setConnected, setLastUpdate}) => {
    const addresses = wallet.addresses.concat(wallet.changeList, wallet.slpList || [])
    const activity = BeginActivity(
        `Downloading transactions for ${Plural(addresses.length, "address", "addresses")}`,
        {scopes: HistoryScopes})
    const notify = () => {
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    let result
    try {
        result = await window.electron.syncHistory({addresses, onProgress: (progress) => {
            if (progress.saved !== undefined) {
                activity.log(`Saved ${Plural(progress.saved, "transaction")}`)
            }
            if (progress.updated) {
                notify()
            }
        }})
    } catch (e) {
        activity.fail(e)
        throw e
    }
    notify()
    if (!result.connected) {
        setConnected(Status.Disconnected)
        activity.fail(new Error(result.error))
        return
    }
    setConnected(Status.Connected)
    activity.end(`Downloaded ${Plural(result.saved, "transaction")}`)
}

export {HistoryScopes}
export default UpdateHistory
