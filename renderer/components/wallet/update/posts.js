import {LikesQuery, PostFields, TxQuery} from "../../util/graphql";

const UpdatePosts = async ({txHashes, setLastUpdate}) => {
    if (!txHashes || !txHashes.length) {
        return
    }
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

// UpdateMemoHistory's posts query only fetches tx_hash/text/tx.seen (see
// update/memo.js) - likes/replies/raw need this separate backfill for
// whatever's currently in the local post list.
const BackfillPosts = async ({addresses, userAddresses, setLastUpdate}) => {
    const posts = await window.electron.getPosts({addresses, userAddresses})
    await UpdatePosts({txHashes: posts.map(post => post.tx_hash), setLastUpdate})
}

export {
    UpdatePosts,
    BackfillPosts,
}
