import {Status} from "../../util/connect"

// Main holds the block subscription and stores each block before this hears
// of it; what's left here is the re-render and the reconnect loop.
const ListenBlocks = ({addresses, setLastUpdate, setConnected}) => {
    const handler = () => {
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    const onopen = () => {
        setConnected(Status.Connected)
    }
    let exited = false
    const onclose = () => {
        setConnected(Status.Disconnected)
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenBlocks({addresses, setLastUpdate, setConnected})
        }, 2000)
    }
    let close = window.electron.listenSync({kind: "blocks", variables: {}, addresses, handler, onopen, onclose})
    return () => {
        exited = true
        close()
    }
}

const RecentBlock = async () => await window.electron.syncBlock()

export {
    ListenBlocks,
    RecentBlock,
}
