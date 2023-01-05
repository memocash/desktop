import {Status} from "../../util/connect"

const ListenBlocks = ({addresses, setLastUpdate, setConnected}) => {
    const query = `
        subscription() {
            blocks() {
                hash
                timestamp
                height
            }
        }
        `
    const handler = async (block) => {
        await window.electron.saveBlock(block.blocks)
        await window.electron.generateHistory(addresses)
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
    let close = window.electron.listenGraphQL({query, handler, onopen, onclose})
    return () => {
        exited = true
        close()
    }
}

const RecentBlock = async () => {
    const query = `
        query () {
            block_newest() {
                hash
                timestamp
                height
            }
        }
        `
    try {
        let data = await window.electron.graphQL(query, {})
        await window.electron.saveBlock(data.data.block_newest)
    } catch (e) {
        console.log(e)
    }
}

export {
    ListenBlocks,
    RecentBlock,
}
