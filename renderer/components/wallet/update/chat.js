import {LikesQuery, PostFields, ProfileFields, TxQuery} from "../../util/graphql";
import {SyncLinkedProfiles} from "./links";
import {LogActivity, Plural, TrackActivity} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";

const ChatScopes = [Tabs.Chat]

const UpdateChatFollows = async ({addresses, setLastUpdate}) =>
    await TrackActivity({
        start: "Loading chat rooms",
        done: count => `Loaded ${Plural(count, "chat room follow")}`,
        scopes: ChatScopes,
    }, () => syncChatFollows({addresses, setLastUpdate}))

const syncChatFollows = async ({addresses, setLastUpdate}) => {
    const query = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            rooms {
                name
                lock {
                    address
                }
                unfollow
                tx_hash
                ${TxQuery}
            }
        }
    }
    `
    let data = await window.electron.graphQL(query, {
        addresses: addresses,
    })
    // Every address gets its own profile in the response, so take all of their
    // rooms - reading only the first dropped the follows of every address but
    // one, which for a wallet synced with its linked-address cluster is most of
    // them. An address with no memo activity comes back without a profile.
    const rooms = (data.data.profiles || []).map(profile => profile.rooms || []).flat()
    if (rooms.length) {
        await window.electron.saveChatRoomFollows(rooms)
    }
    setLastUpdate((new Date()).toISOString())
    return rooms.length
}

// A room's history runs to thousands of posts, so take only the newest page.
// 100 is the server's per-page max - a larger limit is clamped to it. "newest"
// is passed explicitly rather than left to the server default.
const ChatPostLimit = 100
// The room UI and local queries show at most 50 followers, so avoid pulling
// every follow transaction (including raw inputs and outputs) for busy rooms.
const ChatFollowerLimit = 50

const UpdateChat = async ({roomName, setLastUpdate}) =>
    await TrackActivity({
        start: `Loading chat room ${roomName}`,
        done: count => `Loaded ${Plural(count, "post")} in ${roomName}`,
        scopes: ChatScopes,
    }, () => syncChat({roomName, setLastUpdate}))

const syncChat = async ({roomName, setLastUpdate}) => {
    const query = `
    query ($room: String!) {
        room(name: $room) {
            name
            followers(limit: ${ChatFollowerLimit}) {
                name
                tx_hash
                unfollow
                lock {
                    address
                }
                ${TxQuery}
            }
            posts(newest: true, limit: ${ChatPostLimit}) {
                tx_hash
                text
                ${TxQuery}
                ${LikesQuery}
                lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
                replies {
                    ${PostFields}
                }
            }
        }
    }
    `
    let data = await window.electron.graphQL(query, {
        room: roomName,
    })
    await window.electron.saveChatRoom(data.data.room)
    await SyncLinkedProfiles({addresses: [...new Set(data.data.room.posts
        .filter(post => post.lock && post.lock.address)
        .map(post => post.lock.address))]})
    setLastUpdate((new Date()).toISOString())
    return (data.data.room.posts || []).length
}

const ListenChatPosts = ({names, setLastUpdate}) => {
    const query = `
        subscription($names: [String!]) {
            rooms(names: $names) {
                tx_hash
                text
                ${TxQuery}
                ${LikesQuery}
                room {
                    name
                }
                lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
                replies {
                    ${PostFields}
                }
            }
        }
        `
    const handler = async (post) => {
        LogActivity(`New post in ${post.rooms.room.name}`, {scopes: ChatScopes})
        await window.electron.saveChatRoom({name: post.rooms.room.name, posts: [post.rooms]})
        if (post.rooms.lock && post.rooms.lock.address) {
            await SyncLinkedProfiles({addresses: [post.rooms.lock.address]})
        }
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenChatPosts({names, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {names}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

const ListenChatFollows = ({addresses, setLastUpdate}) => {
    const query = `
        subscription($addresses: [Address!]) {
            room_follows(addresses: $addresses) {
                name
                tx_hash
                unfollow
                ${TxQuery}
                lock {
                    address
                }
            }
        }
        `
    const handler = async (roomFollow) => {
        await window.electron.saveChatRoomFollows([roomFollow.room_follows])
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenChatFollows({addresses, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {addresses}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export {
    UpdateChat,
    UpdateChatFollows,
    ListenChatFollows,
    ListenChatPosts,
}
