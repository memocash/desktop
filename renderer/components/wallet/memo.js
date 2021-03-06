import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsPencil} from "react-icons/bs";
import {SetName, SetPic, SetProfile} from "./memo/index";
import ShortHash from "../util/txs";

const Modals = {
    None: "none",
    SetName: "set-name",
    SetProfile: "set-profile",
    SetPic: "set-pic",
}

const Memo = ({lastUpdate}) => {
    const [modal, setModal] = useState(Modals.None)
    const [picData, setPicData] = useState(undefined)
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [following, setFollowing] = useState([])
    const utxosRef = useRef([])
    useEffect(async () => {
        const wallet = await GetWallet()
        const profileInfo = await window.electron.getProfileInfo(wallet.addresses)
        if (profileInfo !== undefined) {
            setProfileInfo(profileInfo)
            if (profileInfo.pic !== undefined) {
                const picData = await window.electron.getPic(profileInfo.pic)
                setPicData(picData)
            }
        }
        utxosRef.current.value = await window.electron.getUtxos(wallet.addresses)
        utxosRef.current.value.sort((a, b) => {
            return b.value - a.value
        })
        const following = await window.electron.getFollowing(wallet.addresses)
        setFollowing(following)
    }, [lastUpdate])
    const clickEditName = () => setModal(Modals.SetName)
    const clickEditProfile = () => setModal(Modals.SetProfile)
    const clickEditPic = () => setModal(Modals.SetPic)
    const onClose = () => setModal(Modals.None)
    const clickTxLink = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    return (
        <div>
            <div className={profile.header}>
                <div className={profile.pic}>
                    {picData ?
                        <img alt={"Profile image"} className={profile.img}
                             src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                        : <div className={profile.img}>Pic not set</div>}
                    <a className={profile.editLink} onClick={clickEditPic}><BsPencil/></a>
                </div>
                <div>
                    <h2>
                        {profileInfo.name ? profileInfo.name : "Name not set"}
                        <a className={profile.editLink} onClick={clickEditName}><BsPencil/></a>
                    </h2>
                    <p>
                        {profileInfo.profile ? profileInfo.profile : "Profile not set"}
                        <a className={profile.editLink} onClick={clickEditProfile}><BsPencil/></a>
                    </p>
                </div>
            </div>
            <div className={profile.followers}>
                <div className={profile.row}>
                    <div>Name</div>
                    <div>Address</div>
                    <div>Tx Hash</div>
                    <div>Follow</div>
                </div>
                {following.map((follow, i) => {
                    return (
                        <div className={profile.row} key={i}>
                            <div>
                                {follow.pic &&
                                <img alt={"Profile image"} className={profile.img}
                                     src={`data:image/png;base64,${Buffer.from(follow.pic_data).toString("base64")}`}/>}
                                {follow.name}
                            </div>
                            <div>{follow.follow_address}</div>
                            <div><a className={profile.txLink} onClick={() => clickTxLink(follow.tx_hash)}>{ShortHash(follow.tx_hash)}</a></div>
                            <div>{follow.unfollow ? "No" : "Yes"}</div>
                        </div>
                    )
                })}
            </div>
            {modal === Modals.SetName && <SetName onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetProfile && <SetProfile onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetPic && <SetPic onClose={onClose} utxosRef={utxosRef}/>}
        </div>
    )
}

export default Memo
