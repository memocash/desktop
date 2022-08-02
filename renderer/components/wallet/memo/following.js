import Modal from "../../modal/modal";
import {Modals} from "./index";
import profile from "../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import FollowList from "./follow-list";
import seed from "../../modal/seed.module.css";

const Following = ({onClose, address, setModal, setProfile, showFollowers=false}) => {
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
            <div className={profile.header_modal}>
                <div className={profile.info}>
                    <p>
                    <h2>
                        {picData ?
                            <img alt={"Profile image"} className={profile.img}
                                 src={`data:image/png;base64,${Buffer.from(picData).toString("base64")}`}/>
                            : <img alt={"Profile image"} className={profile.img}
                                   src={"/default-profile.jpg"}/>}
                        <span>{profileInfo.name ? profileInfo.name : address}
                            {showFollowers ? " followers" : " following"}
                        </span>
                    </h2>
                        <button onClick={() => setModal(Modals.Profile)}>Back to Profile</button>
                    </p>
                </div>
            </div>
            <div className={profile.body_modal}>
                <FollowList addresses={[address]} setProfile={setProfile} showFollowers={showFollowers}/>
            </div>
            <div className={seed.buttons}>
                <button onClick={() => setModal(Modals.None)}>Close</button>
            </div>
        </Modal>
    )
}

export default Following
