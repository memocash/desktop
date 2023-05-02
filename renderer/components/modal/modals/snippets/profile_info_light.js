import profile from "../../../../styles/profile.module.css";
import {Modals} from "../../../../../main/common/util";
import {BsPerson} from "react-icons/bs";
import {useEffect, useState} from "react";

const ProfileInfoLight = ({setModal, address, children}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [picData, setPicData] = useState([])
    useEffect(() => {(async () => {
        const profileInfo = await window.electron.getProfileInfo([address])
        if (profileInfo === undefined) {
            return
        }
        setProfileInfo(profileInfo)
        if (profileInfo.pic !== undefined) {
            const picData = await window.electron.getPic(profileInfo.pic)
            setPicData(picData)
        }
    })()}, [address])
    return (
        <div className={profile.header_modal}>
            <div className={profile.pic}>
                <img alt={"Profile image"} className={profile.img}
                     src={(picData && picData.length) ?
                         `data:image/png;base64,${Buffer.from(picData).toString("base64")}` :
                         "/default-profile.jpg"}/>
            </div>
            <div className={profile.info}>
                <h2>
                    {profileInfo.name ? profileInfo.name : address}
                    {children}
                </h2>
                <p>
                    <button onClick={() => setModal(Modals.ProfileView, {address: profileInfo.address})}>
                        <BsPerson/>
                    </button>
                </p>
            </div>
        </div>
    )
}

export default ProfileInfoLight
