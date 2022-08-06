import SeedModal from "./modals/seed"
import KeyModal from "./modals/key"
import {Modals} from "../../../main/common/util";
import {Find, Following, Post, SetName, SetPic, SetProfile, View} from "./modals/profile";
import Password from "./modals/password";
import {useEffect} from "react";

const Viewer = ({setModal, modalWindow, modalProps = {}}) => {
    useEffect(() => {
        window.electron.listenDisplayModal((e, modal) => setModal(modal))
    }, [])
    const onClose = () => {
        setModal(Modals.None)
    }
    return (
        <div>
            {modalWindow === Modals.Seed && <SeedModal onClose={onClose}/>}
            {modalWindow === Modals.Key && <KeyModal onClose={onClose}/>}
            {modalWindow === Modals.Password && <Password setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.ProfileFind && <Find setModal={setModal}/>}
            {modalWindow === Modals.ProfileSetName && <SetName onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ProfileSetText && <SetProfile onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ProfileSetPic && <SetPic onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ProfileView && <View setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.Following && <Following setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.Followers &&
                <Following setModal={setModal} modalProps={modalProps} showFollowers={true}/>}
            {modalWindow === Modals.Post && <Post setModal={setModal} modalProps={modalProps}/>}
        </div>
    )
}

export default Viewer