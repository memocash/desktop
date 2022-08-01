import profile from "../../../styles/profile.module.css";
import ShortHash from "../../util/txs";
import {useEffect, useState} from "react";
import {TitleCol} from "../snippets/title-col";
import {useReferredState} from "../../util/state";

const Column = {
    Name: "name",
    Address: "address",
    Transaction: "tx_hash",
    Timestamp: "timestamp",
}

const FollowList = ({addresses, setProfile, showFollowers = false}) => {
    const [sortCol, setSortCol] = useState(Column.Timestamp)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const [follows, followsRef, setFollows] = useReferredState([])
    useEffect(async () => {
        if (showFollowers) {
            const followers = await window.electron.getFollowers(addresses)
            setFollows(followers)
        } else {
            const following = await window.electron.getFollowing(addresses)
            setFollows(following)
        }
    }, [addresses])
    const clickTxLink = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const sortTxs = (field) => {
        let desc = !sortDescRef.current
        if (desc) {
            followsRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            followsRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setFollows([...followsRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    return (
        <div className={profile.followers}>
            <div className={profile.row}>
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Name} title={"Name"}/>
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Address} title={"Address"}/>
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Transaction} title={"Transaction"}/>
                <TitleCol sortFunc={sortTxs} desc={sortDesc} sortCol={sortCol}
                          col={Column.Timestamp} title={"Timestamp"}/>
            </div>
            {follows.map((follow, i) => {
                return (
                    <div className={profile.row} key={i}>
                        <div className={profile.imgWrapper}
                             onClick={() => setProfile(showFollowers ? follow.address : follow.follow_address)}>
                            <span>
                            {follow.pic ?
                                <img alt={"Profile image"} className={profile.img}
                                     src={`data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}`}/>
                                :
                                <img alt={"Profile image"} className={profile.img}
                                     src={"/default-profile.jpg"}/>}
                                {follow.name}
                            </span>
                        </div>
                        <div className={profile.address}
                             onClick={() => setProfile(showFollowers ? follow.address : follow.follow_address)}>
                            {showFollowers ? follow.address : follow.follow_address}}
                        </div>
                        <div><a className={profile.txLink} onClick={() => clickTxLink(follow.tx_hash)}>
                            {ShortHash(follow.tx_hash)}
                        </a></div>
                        <div>{follow.timestamp}</div>
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
