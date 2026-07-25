import profile from "../../../styles/profile.module.css";
import ShortHash from "../../util/txs";
import {useEffect} from "react";
import {TitleCol} from "../snippets/title_col";
import {useReferredState} from "../../util/state";
import {TimeSince} from "../../util/time";
import {Modals} from "../../../../main/common/util";

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

const FollowList = ({addresses, setModal, showFollowers = false}) => {
    // Following comes back ordered by last activity descending, so the initial
    // sort state has to match what's already on screen.
    const [sortCol, sortColRef, setSortCol] = useReferredState(
        showFollowers ? Column.Timestamp : Column.LastActivity)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(true)
    const [follows, followsRef, setFollows] = useReferredState([])
    useEffect(() => {(async () => {
        if (showFollowers) {
            const followers = await window.electron.getFollowers(addresses)
            setFollows(followers)
        } else {
            const following = await window.electron.getFollowing(addresses)
            setFollows(following)
        }
    })()}, [addresses])
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
        let sortField = field
        if (field === Column.Address && !showFollowers) {
            sortField = "follow_address"
        }
        followsRef.current.sort((a, b) => compareFollows(a, b, sortField, desc))
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
            {!follows || follows.length === 0 && <div className={profile.noFollowers}>
                {showFollowers ? "Not being followed" : "Not following anyone"}
            </div>}
        </div>
    )
}

export default FollowList
