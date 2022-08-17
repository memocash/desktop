import {LikesQuery, PostFields, ProfileFields, TxQuery} from "../../util/graphql";

const UpdateChatFollows = async ({addresses, setLastUpdate}) => {
    const query = `
    query ($addresses: [String!]) {
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
    await window.electron.saveChatRoomFollows(data.data.profiles[0].rooms)
    setLastUpdate((new Date()).toISOString())
}

const UpdateChat = async ({roomName, setLastUpdate}) => {
    const query = `
    query ($room: String!) {
        room(name: $room) {
            name
            posts {
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
    setLastUpdate((new Date()).toISOString())
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
        await window.electron.saveChatRoom({name: post.rooms.room.name, posts: [post.rooms]})
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    const onclose = () => {
        console.log("GraphQL chat posts subscribe close, reconnecting in 2 seconds!")
        setTimeout(() => {
            close = ListenChatPosts({names, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {names}, handler, onclose})
    return () => close()
}

const ListenChatFollows = ({addresses, setLastUpdate}) => {
    const query = `
        subscription($addresses: [String!]) {
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
    const onclose = () => {
        console.log("GraphQL chat follows subscribe close, reconnecting in 2 seconds!")
        setTimeout(() => {
            close = ListenChatFollows({addresses, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({query, variables: {addresses}, handler, onclose})
    return () => close()
}

export {
    UpdateChat,
    UpdateChatFollows,
    ListenChatFollows,
    ListenChatPosts,
}
