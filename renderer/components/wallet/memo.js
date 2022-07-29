import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsPencil} from "react-icons/bs";
import {Modals, Following, SetName, SetPic, SetProfile} from "./memo/index";
import ShortHash from "../util/txs";
import Profile from "./memo/profile";

const Memo = ({lastUpdate, setAddress, address}) => {
    const [modal, setModal] = useState(Modals.None)
    const [profileAddress, setProfileAddress] = useState("")
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
    useEffect(() => {
        if (address && address.length) {
            setProfile(address)
        }
    }, [address])
    const clickEditName = () => setModal(Modals.SetName)
    const clickEditProfile = () => setModal(Modals.SetProfile)
    const clickEditPic = () => setModal(Modals.SetPic)
    const onClose = () => {
        setModal(Modals.None)
        setAddress("")
    }
    const clickTxLink = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const setProfile = (address) => {
        setProfileAddress(address)
        setModal(Modals.Profile)
    }
    return (
        <div className={profile.wrapper}>
            <div className={profile.header}>
                <div className={profile.pic} onClick={clickEditPic}>
                    {picData ?
                        <img alt={"Profile image"} className={profile.img}
                             src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                        : <img alt={"Profile image"} className={profile.img}
                               src={"/default-profile.jpg"}/>}
                    <a className={profile.editLink}><BsPencil/></a>
                </div>
                <div>
                    <h2 onClick={clickEditName}>
                        {profileInfo.name ? profileInfo.name : "Name not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </h2>
                    <p onClick={clickEditProfile}>
                        {profileInfo.profile ? profileInfo.profile : "Profile not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </p>
                </div>
            </div>
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
            </div>
            {modal === Modals.SetName && <SetName onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetProfile && <SetProfile onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetPic && <SetPic onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.Profile && <Profile onClose={onClose} utxosRef={utxosRef} address={profileAddress}
                                                  lastUpdate={lastUpdate} setModal={setModal}/>}
            {modal === Modals.Following && <Following onClose={onClose} address={profileAddress} setModal={setModal}/>}
        </div>
    )
}

export default Memo
