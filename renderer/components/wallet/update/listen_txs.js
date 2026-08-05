import {opcodes, script} from "../../util/bitcoincash"
import bitcoin from "../../util/bitcoin"
import {LogActivity} from "../../util/activity"
import {HistoryScopes} from "./history"
import {UpdatePosts} from "./posts"

// A like or a reply is a transaction of its own - it doesn't touch the post it
// acts on - so saving it locally leaves the post itself untouched: the heart
// stays unfilled and the counts stale until the post is fetched from the server
// again, which used to mean the next full sync (or a restart). These are the
// memo actions that name a post in their OP_RETURN, so seeing one is what says
// which post has to be refreshed.
const PostActionPrefixes = [bitcoin.Prefix.LikeMemo, bitcoin.Prefix.ReplyMemo]

const getActedOnPosts = (outputs) => {
    const txHashes = []
    for (const output of outputs || []) {
        if (!output.script) {
            continue
        }
        const chunks = script.decompile(Buffer.from(output.script, "hex"))
        if (!chunks || chunks.length < 3 || chunks[0] !== opcodes.OP_RETURN ||
            !Buffer.isBuffer(chunks[1]) || !PostActionPrefixes.includes(chunks[1].toString("hex")) ||
            !Buffer.isBuffer(chunks[2]) || chunks[2].length !== bitcoin.Fee.TxHashByteLength) {
            continue
        }
        // The protocol writes the hash in internal byte order, the display (and
        // local db) order is the reverse.
        txHashes.push(Buffer.from(chunks[2]).reverse().toString("hex"))
    }
    return [...new Set(txHashes)]
}

const ListenNewTxs = ({wallet, setLastUpdate}) => {
    const query = `
        subscription($addresses: [Address!]) {
            addresses(addresses: $addresses) {
                hash
                seen
                raw
                inputs {
                    index
                    prev_hash
                    prev_index
                }
                outputs {
                    index
                    amount
                    script
                    lock {
                        address
                    }
                    slp {
                        amount
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
                    slp_baton {
                        token_hash
                        genesis {
                            hash
                            token_type
                            decimals
                            ticker
                            name
                            doc_url
                        }
                    }
                }
                blocks {
                    block {
                        hash
                        timestamp
                        height
                    }
                }
            }
        }
        `
    const notifyUpdate = () => {
        if (typeof setLastUpdate === "function") {
            setLastUpdate((new Date()).toISOString())
        }
    }
    const handler = async (tx) => {
        LogActivity("New wallet transaction received", {scopes: HistoryScopes})
        await window.electron.saveTransactions([tx.addresses])
        await window.electron.generateHistory(wallet.addresses.concat(wallet.slpList || []))
        // History first, then the post: the transaction is already saved and the
        // panes waiting on it shouldn't sit behind a post fetch that only the
        // memo views care about. Both end in a notify, so the second pass is what
        // fills in the heart and the counts.
        notifyUpdate()
        const postTxHashes = getActedOnPosts(tx.addresses.outputs)
        if (!postTxHashes.length) {
            return
        }
        try {
            await UpdatePosts({txHashes: postTxHashes})
        } catch (e) {
            // Same degraded outcome as before this refresh existed - the post
            // stays as last synced - rather than losing the notify below.
            console.log("ListenNewTxs: post refresh failed", e)
        }
        notifyUpdate()
    }
    let exited = false
    const onclose = () => {
        if (exited) {
            return
        }
        setTimeout(() => {
            close = ListenNewTxs({wallet, setLastUpdate})
        }, 2000)
    }
    let close = window.electron.listenGraphQL({
        query, variables: {addresses: wallet.addresses.concat(wallet.slpList || [])}, handler, onclose})
    return () => {
        exited = true
        close()
    }
}

export default ListenNewTxs
