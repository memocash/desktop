const {GraphQL} = require("../client/graphql")
const {SaveChatRoom, SaveChatRoomFollows} = require("../data/tables")
const {LikesQuery, PostFields, ProfileFields, TxQuery} = require("./fields")
const {SyncLinkedProfiles} = require("./memo")

const ChatFollowsQuery = `
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

// The rooms a set of addresses follow. Every address gets its own profile in
// the response, so take all of their rooms - reading only the first dropped
// the follows of every address but one, which for a wallet synced with its
// linked-address cluster is most of them. An address with no memo activity
// comes back without a profile. Returns how many follows were stored.
const SyncChatFollows = async ({conf, addresses, graphQL = GraphQL}) => {
    const data = await graphQL({network: conf, query: ChatFollowsQuery, variables: {addresses}})
    const rooms = (data.data.profiles || []).map(profile => profile.rooms || []).flat()
    if (rooms.length) {
        await SaveChatRoomFollows(conf, rooms)
    }
    return rooms.length
}

// A room's history runs to thousands of posts, so take only the newest page.
// 100 is the server's per-page max - a larger limit is clamped to it. "newest"
// is passed explicitly rather than left to the server default.
const ChatPostLimit = 100
// The room UI and local queries show at most 50 followers, so avoid pulling
// every follow transaction (including raw inputs and outputs) for busy rooms.
const ChatFollowerLimit = 50

const ChatQuery = `
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

// A room's newest posts and followers, plus the linked identities of whoever
// posted so their inherited names and pics resolve. Returns the post count.
const SyncChat = async ({conf, roomName, graphQL = GraphQL}) => {
    const data = await graphQL({network: conf, query: ChatQuery, variables: {room: roomName}})
    await SaveChatRoom(conf, data.data.room)
    await SyncLinkedProfiles({conf, addresses: [...new Set((data.data.room.posts || [])
        .filter(post => post.lock && post.lock.address)
        .map(post => post.lock.address))], graphQL})
    return (data.data.room.posts || []).length
}

const ChatPostsSubscription = `
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

const ChatFollowsSubscription = `
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

// A post pushed into a followed room.
const SaveNewChatPost = async ({conf, post, graphQL = GraphQL}) => {
    await SaveChatRoom(conf, {name: post.room.name, posts: [post]})
    if (post.lock && post.lock.address) {
        await SyncLinkedProfiles({conf, addresses: [post.lock.address], graphQL})
    }
}

const SaveNewChatFollow = async ({conf, roomFollow}) => SaveChatRoomFollows(conf, [roomFollow])

module.exports = {
    ChatFollowsSubscription,
    ChatPostsSubscription,
    SaveNewChatFollow,
    SaveNewChatPost,
    SyncChat,
    SyncChatFollows,
}
