import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";
import {ListenChatFollows, ListenChatPosts, SyncProfileLinks, UpdateChat, UpdateChatFollows} from "../update/index";

const Update = ({followsRef, room, setFollows, setIsFollowingRoom, setLastUpdate, setLoadingRoom}) => {
    const [lastUpdateFollows, setLastUpdateFollows] = useState(null)
    // Wallet addresses expanded with their linked-address cluster: rooms joined
    // from a linked account belong to the same identity, and on a freshly
    // imported account they're usually all of them. Resolved from the local db
    // first so the sidebar fills without waiting on the network, then widened
    // by the sync - the chat pane mounts on its own (see Page in pages/wallet),
    // so it can't rely on the startup sync in wallet/update.js having run.
    const [addresses, setAddresses] = useState(null)
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const walletAddresses = wallet.addresses.concat(wallet.changeList || [])
        const known = await window.electron.getLinkedAddresses(walletAddresses)
        setAddresses(known)
        const linked = await SyncProfileLinks({addresses: walletAddresses}).catch(e => {
            console.log("Chat: SyncProfileLinks failed", e)
            return null
        })
        // Only replace the list when it actually grew - a new array of the same
        // addresses would re-run the follows query and reconnect the socket.
        if (linked && (linked.length !== known.length || linked.some(address => !known.includes(address)))) {
            setAddresses(linked)
        }
    })()}, [])
    useEffect(() => {
        if (!addresses) {
            return
        }
        ;(async () => {
            const follows = await window.electron.getChatFollows({addresses})
            setFollows(follows)
            checkIsFollowing()
        })()
    }, [lastUpdateFollows, addresses])
    useEffect(() => {
        if (!addresses) {
            return
        }
        ;(async () => {
            await UpdateChatFollows({addresses, setLastUpdate: setLastUpdateFollows})
        })()
    }, [addresses])
    useEffect(() => {
        if (!addresses) {
            return
        }
        const closeSocketFollows = ListenChatFollows({addresses, setLastUpdate: setLastUpdateFollows})
        return () => closeSocketFollows()
    }, [addresses])
    useEffect(() => {
        if (!room || !room.length) {
            setLoadingRoom(null)
            return
        }
        let active = true
        setLoadingRoom(room)
        ;(async () => {
            try {
                await UpdateChat({roomName: room, setLastUpdate})
            } finally {
                if (active) {
                    setLoadingRoom((loadingRoom) => loadingRoom === room ? null : loadingRoom)
                }
            }
        })()
        const closeSocket = ListenChatPosts({names: [room], setLastUpdate})
        checkIsFollowing()
        return () => {
            active = false
            closeSocket()
        }
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
