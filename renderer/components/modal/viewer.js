import SeedModal from "./modals/seed"
import KeyModal from "./modals/key"
import AddressModal from "./modals/address";
import SettingsModal from "./modals/settings";
import {Modals} from "../../../main/common/util";
import {
    Find, Following, Post, PostCreate, PostLike, PostLikes, PostReply, SetName, SetPic, SetProfile, View
} from "./modals/profile";
import Password from "./modals/password";
import {useEffect} from "react";
import RoomLoad from "./modals/chat/room_load";
import RoomJoin from "./modals/chat/room_join";
import RoomFollowers from "./modals/chat/room_followers";
import RoomFollowing from "./modals/chat/room_following";
import NetworkView from "./modals/network_view";
import GetPassword from "./modals/get_password";
import remove from "./modals/remove";
import RemoveModal from "./modals/remove";

const Viewer = ({setLastUpdate, setModal, modalWindow, setChatRoom, modalProps = {}}) => {
    useEffect(() => {
        window.electron.listenDisplayModal((e, modal, props = {}) => setModal(modal, props))
    }, [])
    const onClose = () => {
        setModal(Modals.None)
    }
    const basic = {setModal, onClose, setChatRoom}
    const removeBasic = {onClose, setLastUpdate, setModal}
    return (
        <div>
            {modalWindow === Modals.Seed && <SeedModal onClose={onClose}/>}
            {modalWindow === Modals.Key && <KeyModal onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.Address && <AddressModal onClose={onClose} setLastUpdate={setLastUpdate} setModal={setModal}/>}
            {modalWindow === Modals.Remove && <RemoveModal basic={removeBasic} modalProps={modalProps}/>}
            {modalWindow === Modals.Settings && <SettingsModal onClose={onClose} setLastUpdate={setLastUpdate} setModal={setModal}/>}
            {modalWindow === Modals.Password && <GetPassword onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ProfileFind && <Find setModal={setModal}/>}
            {modalWindow === Modals.ProfileSetName && <SetName onClose={onClose} modalProps={modalProps} setModal={setModal}/>}
            {modalWindow === Modals.ProfileSetText && <SetProfile onClose={onClose} modalProps={modalProps} setModal={setModal}/>}
            {modalWindow === Modals.ProfileSetPic && <SetPic onClose={onClose} modalProps={modalProps} setModal={setModal}/>}
            {modalWindow === Modals.ProfileView && <View basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.Following && <Following setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.Followers &&
                <Following setModal={setModal} modalProps={modalProps} showFollowers={true}/>}
            {modalWindow === Modals.Post && <Post basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.PostLikes && <PostLikes basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.PostCreate && <PostCreate onClose={onClose} modalProps={modalProps} setModal={setModal}/>}
            {modalWindow === Modals.PostLike && <PostLike basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.PostReply && <PostReply basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomFollowers && <RoomFollowers basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomFollowing && <RoomFollowing basic={basic} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomLoad && <RoomLoad onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomJoin && <RoomJoin onClose={onClose} modalProps={modalProps} setModal={setModal}/>}
            {modalWindow === Modals.NetworkView && <NetworkView onClose={onClose}/>}
        </div>
    )
}

export default Viewer
