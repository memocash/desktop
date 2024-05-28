import {LikesQuery, PostFields, TxQuery} from "../../util/graphql";

const UpdatePosts = async ({txHashes, setLastUpdate}) => {
    const query = `
        query($txHashes: [Hash!]) {
            posts(txHashes: $txHashes) {
                tx_hash
                text
                lock {
                    address
                }
                ${TxQuery}
                ${LikesQuery}
                parent {
                    ${PostFields}
                }
                replies {
                    ${PostFields}
                }
            }
        }
        `
    let data = await window.electron.graphQL(query, {
        txHashes: txHashes,
    })
    await window.electron.saveMemoPosts(data.data.posts)
    if (typeof setLastUpdate == "function") {
        setLastUpdate((new Date()).toISOString())
    }
}

export {
    UpdatePosts,
}
