const ListenBlocks = ({setLastUpdate}) => {
    const query = `
        subscription() {
            blocks() {
                hash
                timestamp
                height
            }
        }
        `
    window.electron.listenNewTxs(query, {}, async (block) => {
        await window.electron.saveBlock(block)
        if (typeof setLastUpdate === "function") {
            console.log("setting new last update new block: " + (new Date()).toISOString())
            setLastUpdate((new Date()).toISOString())
        }
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
