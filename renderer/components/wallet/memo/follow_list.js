import profile from "../../../styles/profile.module.css";
import ShortHash from "../../util/txs";
import {useEffect, useRef, useState} from "react";
import {TitleCol} from "../snippets/title_col";
import {useReferredState} from "../../util/state";
import {TimeSince} from "../../util/time";
import {Modals, Tabs} from "../../../../main/common/util";
import {SyncProfileLinks, UpdateMemoProfile} from "../update/index";
import {EmptyState} from "../../util/empty";
import {Loading} from "../../util/loading";
import {useScopeActivity} from "../../util/activity";
import {BsExclamationTriangle, BsPeople, BsPersonPlus} from "../../util/icons";

const Column = {
    Name: "name",
    Address: "address",
    Transaction: "tx_hash",
    Timestamp: "timestamp",
    LastActivity: "last_activity",
}

// Rows missing a value (no name set, never posted) stay at the bottom of both
// directions instead of taking over the top of a descending sort.
const compareFollows = (a, b, field, desc) => {
    const aVal = a[field], bVal = b[field]
    const aEmpty = aVal === null || aVal === undefined || aVal === ""
    const bEmpty = bVal === null || bVal === undefined || bVal === ""
    if (aEmpty || bEmpty) {
        return aEmpty === bEmpty ? 0 : (aEmpty ? 1 : -1)
    }
    if (aVal === bVal) {
        return 0
    }
    return (aVal > bVal ? 1 : -1) * (desc ? -1 : 1)
}

// scope names the sync that downloads these follow rows, so an empty list isn't
// reported as "not following anyone" while they're still on their way: the Memo
// tab's own list waits on the wallet sync, and the modal opened from a profile
// waits on that profile's.
const FollowList = ({addresses, setModal, showFollowers = false, scope = Tabs.Memo}) => {
    // Following comes back ordered by last activity descending, so the initial
    // sort state has to match what's already on screen.
    const [sortCol, sortColRef, setSortCol] = useReferredState(
        showFollowers ? Column.Timestamp : Column.LastActivity)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(true)
    const [follows, followsRef, setFollows] = useReferredState([])
    // Whether the local list has actually been read for the current addresses.
    // Nothing on screen is an answer only once it has.
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)
    const activity = useScopeActivity(scope)
    const syncedRef = useRef(new Set())
    const addressKey = [...addresses].sort().join("\0")
    const rowAddress = (follow) => showFollowers ? follow.address : follow.follow_address
    const sortFieldOf = (col) => (col === Column.Address && !showFollowers) ? "follow_address" : col
    useEffect(() => {
        let active = true
        syncedRef.current = new Set()
        if (!addresses.length) {
            // The caller hasn't resolved whose follows these are yet (the Memo
            // tab fills its address list from an effect of its own), so there's
            // nothing to read and nothing to conclude from an empty list.
            setLoaded(false)
            setFailed(false)
            setFollows([])
            return
        }
        setFailed(false)
        const readFollows = async () => {
            const rows = showFollowers
                ? await window.electron.getFollowers(addresses)
                : await window.electron.getFollowing(addresses)
            if (!active) {
                return []
            }
            const sorted = [...rows].sort((a, b) =>
                compareFollows(a, b, sortFieldOf(sortColRef.current), sortDescRef.current))
            setFollows(sorted)
            setLoaded(true)
            return sorted
        }
        const syncProfiles = async (syncAddresses) => {
            const unsynced = syncAddresses.filter(address => !syncedRef.current.has(address))
            if (!unsynced.length) {
                return false
            }
            await UpdateMemoProfile({addresses: unsynced, setLastUpdate: () => {}})
            unsynced.forEach(address => syncedRef.current.add(address))
            return true
        }
        (async () => {
            let rows = await readFollows()
            const incomplete = rows.filter(follow => !follow.name || (follow.pic && !follow.pic_data))
            if (incomplete.length) {
                const synced = await syncProfiles(incomplete.map(rowAddress))
                    .catch(e => console.log("FollowList: profile sync failed", e))
                if (!active) {
                    return
                }
                if (synced) {
                    rows = await readFollows()
                }
            }
            const undiscovered = rows.filter(follow => !follow.name || !follow.pic).map(rowAddress)
            if (!undiscovered.length) {
                return
            }
            const linked = await SyncProfileLinks({addresses: undiscovered})
                .catch(e => {
                    console.log("FollowList: link sync failed", e)
                    return []
                })
            if (!active || !linked.length) {
                return
            }
            await syncProfiles(linked)
                .catch(e => console.log("FollowList: linked profile sync failed", e))
            if (active) {
                await readFollows()
            }
        })().catch(e => {
            console.log("FollowList: follow read failed", e)
            // A read that never lands would otherwise leave the list spinning
            // for work that has stopped. Say the read failed instead - and mark
            // it answered, so the spinner doesn't outlive the attempt.
            if (active) {
                setFailed(true)
                setLoaded(true)
            }
        })
        return () => { active = false }
    }, [addressKey])
    const clickTxLink = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const sortTxs = (field) => {
        let desc = sortDescRef.current
        if (sortColRef.current === field) {
            desc = !desc
        } else {
            desc = true
        }
        followsRef.current.sort((a, b) => compareFollows(a, b, sortFieldOf(field), desc))
        setFollows([...followsRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    const setProfile = (address) => setModal(Modals.ProfileView, {address})
    return (
        <div className={[profile.followers, showFollowers ? "" : profile.with_activity].join(" ")}>
            <div className={profile.row}>
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Name} title={"Name"}/>
                {!showFollowers && <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                                             col={Column.LastActivity} title={"Last Active"}/>}
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Transaction} title={"Transaction"}/>
            </div>
            {follows.map((follow, i) => {
                return (
                    <div className={profile.row} key={i}>
                        <div className={profile.imgWrapper}
                             onClick={() => setProfile(showFollowers ? follow.address : follow.follow_address)}>
                            <img alt={"Profile image"} className={profile.img}
                                 src={(follow.pic_data && follow.pic_data.length) ?
                                     `data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}` :
                                     "/default-profile.jpg"}/>
                            {(follow.name && follow.name.length) ? follow.name :
                                (showFollowers ? follow.address : follow.follow_address)}
                        </div>
                        {!showFollowers && <div title={follow.last_activity || ""}>
                            {follow.last_activity ? TimeSince(follow.last_activity) : "None"}
                        </div>}
                        <div>
                            <a className={profile.txLink} onClick={() => clickTxLink(follow.tx_hash)}>
                                {ShortHash(follow.tx_hash)}
                            </a>
                            <span className={profile.time} title={follow.timestamp}>
                                {follow.timestamp ? " " + TimeSince(follow.timestamp) : ""}
                            </span>
                        </div>
                    </div>
                )
            })}
            {!follows.length && (failed ?
                <EmptyState icon={<BsExclamationTriangle/>}
                            title={showFollowers ? "Could not load followers" : "Could not load follows"}>
                    Check the connection indicator below and try again.
                </EmptyState> :
                (!loaded || activity.busy ?
                <Loading>{showFollowers ? "Loading followers..." : "Loading follows..."}</Loading> :
                (showFollowers ?
                    <EmptyState icon={<BsPeople/>} title={"No followers yet"}>
                        People who follow this profile show up here.
                    </EmptyState> :
                    <EmptyState icon={<BsPersonPlus/>} title={"Not following anyone"}>
                        Follow someone from the Global feed and they show up here, with their posts in your feed.
                    </EmptyState>)))}
        </div>
    )
}

export default FollowList
