import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsPencil} from "react-icons/bs";
import {Following, Modals, SetName, SetPic, SetProfile} from "./memo/index";
import Profile from "./memo/profile";
import FollowList from "./memo/follow-list";

const Memo = ({lastUpdate, setAddress, address}) => {
    const [modal, setModal] = useState(Modals.None)
    const [profileAddress, setProfileAddress] = useState("")
    const [picData, setPicData] = useState(undefined)
    const [profileInfo, setProfileInfo] = useState({
        address: "",
        name: "",
        profile: "",
        pic: "",
    })
    const [walletAddresses, setWalletAddresses] = useState([])
    const utxosRef = useRef([])
    useEffect(async () => {
        const wallet = await GetWallet()
        setWalletAddresses(wallet.addresses)
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
    const setProfile = (address) => {
        setProfileAddress(address)
        setModal(Modals.Profile)
    }
    return (
        <div className={profile.wrapper}>
            <div className={profile.header}>
                <div className={profile.pic} onClick={clickEditPic}>
                    <img alt={"Profile image"} className={profile.img} src={picData ?
                        `data:image/png;base64,${Buffer.from(picData).toString("base64")}` :
                        "/default-profile.jpg"}/>
                    <a className={profile.editLink}><BsPencil/></a>
                </div>
                <div>
                    <h2 onClick={clickEditName}>
                        {profileInfo.name ? profileInfo.name : "Name not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </h2>
                    <p className={profile.text} onClick={clickEditProfile}>
                        {profileInfo.profile ? profileInfo.profile : "Profile not set"}
                        <a className={profile.editLink}><BsPencil/></a>
                    </p>
                    <p>
                        <button onClick={() => setProfile(profileInfo.address)}>Profile</button>
                    </p>
                </div>
            </div>
            <FollowList addresses={walletAddresses} setProfile={setProfile}/>
            {modal === Modals.SetName && <SetName onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetProfile && <SetProfile onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.SetPic && <SetPic onClose={onClose} utxosRef={utxosRef}/>}
            {modal === Modals.Profile && <Profile onClose={onClose} utxosRef={utxosRef} address={profileAddress}
                                                  lastUpdate={lastUpdate} setModal={setModal} setAddress={setAddress}/>}
            {modal === Modals.Following && <Following onClose={onClose} address={profileAddress} setModal={setModal}
                                                      setProfile={setProfile}/>}
            {modal === Modals.Followers && <Following onClose={onClose} address={profileAddress} setModal={setModal}
                                                      setProfile={setProfile} showFollowers={true}/>}
        </div>
    )
}

export default Memo
