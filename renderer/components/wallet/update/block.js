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
    const onclose = () => {
        setConnected(Status.Disconnected)
        console.log("GraphQL block subscribe close, reconnecting in 2 seconds!")
        setTimeout(() => {
            ListenBlocks({addresses, setLastUpdate, setConnected})
        }, 2000)
    }
    window.electron.listenNewTxs({query, handler, onopen, onclose})
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
