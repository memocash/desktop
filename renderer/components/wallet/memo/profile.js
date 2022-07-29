import Modal from "../../modal/modal";
import seed from "../../modal/seed.module.css";
import {useEffect, useState} from "react";
import profile from "../../../styles/profile.module.css";

const Profile = ({onClose, address}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [picData, setPicData] = useState(undefined)
    useEffect(async () => {
        const profileInfo = await window.electron.getProfileInfo([address])
        if (profileInfo === undefined) {
            return
        }
        setProfileInfo(profileInfo)
        if (profileInfo.pic !== undefined) {
            const picData = await window.electron.getPic(profileInfo.pic)
            setPicData(picData)
        }
    }, [address])
    return (
        <Modal onClose={onClose}>
            <div className={profile.header}>
                <div className={profile.pic}>
                    {picData ?
                        <img alt={"Profile image"} className={profile.img}
                             src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                        : <img alt={"Profile image"} className={profile.img}
                               src={"/default-profile.jpg"}/>}
                </div>
                <div>
                    <h2>{profileInfo.name ? profileInfo.name : "Name not set"}</h2>
                    <p>{profileInfo.profile ? profileInfo.profile : "Profile not set"}</p>
                    <p>Address: {address}</p>
                </div>
            </div>
            <div className={seed.buttons}>
                <button onClick={onClose}>Close</button>
            </div>
        </Modal>
    )
}

export default Profile
