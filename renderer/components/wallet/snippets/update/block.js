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
    setConnected(true)
    window.electron.listenNewTxs(query, {}, async (block) => {
        await window.electron.saveBlock(block.blocks)
        await window.electron.generateHistory(addresses)
        if (typeof setLastUpdate === "function") {
            console.log("setting new last update new block: " + (new Date()).toISOString())
            setLastUpdate((new Date()).toISOString())
        }
    }, () => {
        setConnected(false)
        console.log("GraphQL block subscribe close, reconnecting in 2 seconds!")
        setTimeout(() => {
            ListenBlocks({addresses, setLastUpdate, setConnected})
        }, 2000)
    })
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
    let data = await window.electron.graphQL(query, {})
    await window.electron.saveBlock(data.data.block_newest)
}

export {
    ListenBlocks,
    RecentBlock,
}
