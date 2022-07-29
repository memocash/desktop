import profile from "../../../styles/profile.module.css";
import ShortHash from "../../util/txs";
import {useEffect, useState} from "react";

const FollowList = ({addresses, setProfile}) => {
    const [following, setFollowing] = useState([])
    useEffect(async () => {
        const following = await window.electron.getFollowing(addresses)
        setFollowing(following)
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
            {following.map((follow, i) => {
                return (
                    <div className={profile.row} key={i}>
                        <div className={profile.imgWrapper} onClick={() => setProfile(follow.follow_address)}>
                            {follow.pic ?
                                <img alt={"Profile image"} className={profile.img}
                                     src={`data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}`}/>
                                :
                                <img alt={"Profile image"} className={profile.img}
                                     src={"/default-profile.jpg"}/>}
                            <span>{follow.name}</span>
                        </div>
                        <div>{follow.follow_address}</div>
                        <div><a className={profile.txLink} onClick={() => clickTxLink(follow.tx_hash)}>
                            {ShortHash(follow.tx_hash)}
                        </a></div>
                    </div>
                )
            })}
            {!following || following.length === 0 && <div className={profile.noFollowers}>Not following anyone</div>}
        </div>
    )
}

export default FollowList
