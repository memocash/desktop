import Modal from "../../modal";
import {Modals} from "../../../../../main/common/util"
import profile from "../../../../styles/profile.module.css";
import {useEffect, useState} from "react";
import FollowList from "../../../wallet/memo/follow_list";
import styles from "../../../../styles/modal.module.css"
import {BsPerson} from "react-icons/bs";

const Following = ({setModal, modalProps: {address}, showFollowers = false}) => {
    const [profileInfo, setProfileInfo] = useState({
        name: "",
        profile: "",
        pic: "",
    })
    const [picData, setPicData] = useState([])
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
    const onClose = () => setModal(Modals.None)
    return (
        <Modal onClose={onClose}>
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
                        {showFollowers ? " followers" : " following"}
                    </h2>
                    <p>
                        <button onClick={() => setModal(Modals.ProfileView, {address: profileInfo.address})}>
                            <BsPerson/>
                        </button>
                    </p>
                </div>
            </div>
            <div className={profile.body_modal}>
                <FollowList addresses={[address]} setModal={setModal} showFollowers={showFollowers}/>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setModal(Modals.None)}>Close</button>
            </div>
        </Modal>
    )
}

export default Following
