import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import profile from "../../styles/profile.module.css";
import {BsPencil} from "react-icons/bs";
import FollowList from "./memo/follow_list";
import {Modals} from "../../../main/common/util";

const Memo = ({lastUpdate, setModal}) => {
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
    const clickEditName = () => setModal(Modals.ProfileSetName, {utxosRef})
    const clickEditProfile = () => setModal(Modals.ProfileSetText, {utxosRef})
    const clickEditPic = () => setModal(Modals.ProfileSetPic, {utxosRef})
    const setProfile = (address) => setModal(Modals.ProfileView, {address, utxosRef, lastUpdate})
    const createPost = () => setModal(Modals.PostCreate, {utxosRef})
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
                        <button onClick={() => createPost()}>New Post</button>
                    </p>
                </div>
            </div>
            <FollowList addresses={walletAddresses} setModal={setModal}/>
        </div>
    )
}

export default Memo
