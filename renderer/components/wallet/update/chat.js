import {LogActivity, Plural, TrackActivity} from "../../util/activity";
import {Tabs} from "../../../../main/common/util";

const ChatScopes = [Tabs.Chat]

// Room syncs and subscriptions run in main (main/sync/chat.js); what's left
// here is the activity reporting, the re-render, and the reconnect loops.
const UpdateChatFollows = async ({addresses, setLastUpdate}) =>
    await TrackActivity({
        start: "Loading chat rooms",
        done: count => `Loaded ${Plural(count, "chat room follow")}`,
        scopes: ChatScopes,
    }, async () => {
        const count = await window.electron.syncChatFollows({addresses})
        setLastUpdate((new Date()).toISOString())
        return count
    })

const UpdateChat = async ({roomName, setLastUpdate}) =>
    await TrackActivity({
        start: `Loading chat room ${roomName}`,
        done: count => `Loaded ${Plural(count, "post")} in ${roomName}`,
        scopes: ChatScopes,
    }, async () => {
        const count = await window.electron.syncChat({roomName})
        setLastUpdate((new Date()).toISOString())
        return count
    })

const notify = (setLastUpdate) => {
    if (typeof setLastUpdate === "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

const ListenChatPosts = ({names, setLastUpdate}) => {
    const handler = (post) => {
        LogActivity(`New post in ${post.rooms.room.name}`, {scopes: ChatScopes})
        notify(setLastUpdate)
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
    let close = window.electron.listenSync({kind: "chatPosts", variables: {names}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

const ListenChatFollows = ({addresses, setLastUpdate}) => {
    const handler = () => notify(setLastUpdate)
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenChatFollows({addresses, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenSync({kind: "chatFollows", variables: {addresses}, handler, onclose})
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
