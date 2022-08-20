import SeedModal from "./modals/seed"
import KeyModal from "./modals/key"
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

const Viewer = ({setModal, modalWindow, setChatRoom, modalProps = {}}) => {
    useEffect(() => {
        window.electron.listenDisplayModal((e, modal, props = {}) => setModal(modal, props))
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
            {modalWindow === Modals.PostLikes && <PostLikes setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.PostCreate && <PostCreate onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.PostLike && <PostLike setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.PostReply && <PostReply setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomFollowers && <RoomFollowers setModal={setModal} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomFollowing &&
                <RoomFollowing setModal={setModal} setChatRoom={setChatRoom} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomLoad && <RoomLoad onClose={onClose} modalProps={modalProps}/>}
            {modalWindow === Modals.ChatRoomJoin && <RoomJoin onClose={onClose} modalProps={modalProps}/>}
        </div>
    )
}

export default Viewer
