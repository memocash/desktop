import profile from "../../../styles/profile.module.css";
import ShortHash from "../../util/txs";
import {useEffect, useState} from "react";

const FollowList = ({addresses, setProfile, showFollowers = false}) => {
    const [follows, setFollows] = useState([])
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
    return (
        <div className={profile.followers}>
            <div className={profile.row}>
                <div>Name</div>
                <div>Address</div>
                <div>Tx Hash</div>
            </div>
            {follows.map((follow, i) => {
                return (
                    <div className={profile.row} key={i}>
                        <div className={profile.imgWrapper}
                             onClick={() => setProfile(showFollowers ? follow.address : follow.follow_address)}>
                            {follow.pic ?
                                <img alt={"Profile image"} className={profile.img}
                                     src={`data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}`}/>
                                :
                                <img alt={"Profile image"} className={profile.img}
                                     src={"/default-profile.jpg"}/>}
                            <span>{follow.name}</span>
                        </div>
                        <div>{showFollowers ? follow.address : follow.follow_address}}</div>
                        <div><a className={profile.txLink} onClick={() => clickTxLink(follow.tx_hash)}>
                            {ShortHash(follow.tx_hash)}
                        </a></div>
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
