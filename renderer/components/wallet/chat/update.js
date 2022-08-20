import {useEffect} from "react";
import GetWallet from "../../util/wallet";
import {ListenChatFollows, ListenChatPosts, UpdateChat, UpdateChatFollows} from "../update/index";

const Update = (props) => {
    const {
        followsRef, lastUpdateFollows, room, setFollows, setIsFollowingRoom, setLastUpdate, setLastUpdateFollows
    } = props;
    useEffect(async () => {
        const {addresses} = await GetWallet()
        const follows = await window.electron.getChatFollows({addresses})
        setFollows(follows)
        checkIsFollowing()
    }, [lastUpdateFollows])
    useEffect(async () => {
        const {addresses} = await GetWallet()
        await UpdateChatFollows({addresses, setLastUpdate: setLastUpdateFollows});
    }, [])
    useEffect(() => {
        let closeSocketFollows
        (async () => {
            const {addresses} = await GetWallet()
            closeSocketFollows = ListenChatFollows({addresses, setLastUpdate: setLastUpdateFollows})
        })()
        return () => closeSocketFollows()
    }, [])
    useEffect(() => {
        if (!room || !room.length) {
            return
        }
        (async () => await UpdateChat({roomName: room, setLastUpdate}))()
        const closeSocket = ListenChatPosts({names: [room], setLastUpdate})
        checkIsFollowing()
        return () => closeSocket()
    }, [room])
    const checkIsFollowing = () => {
        let isFollowingRoom = false
        for (let i = 0; i < followsRef.current.length; i++) {
            if (followsRef.current[i].room === room) {
                isFollowingRoom = true
                break
            }
        }
        setIsFollowingRoom(isFollowingRoom)
    }
    return (<></>)
}

export default Update
