import {useEffect, useRef} from "react";
import GetWallet from "../util/wallet";
import {BackfillPosts, ListenBlocks, ListenNewTxs, ListenPosts, RecentBlock, SyncAliases, SyncProfileLinks, UpdateHistory,
    UpdateMemoHistory, UpdateSlp} from "./update/index.js";
import ListenNewMemos from "./update/listen_memo";

const Update = ({setConnected, setLastUpdate}) => {
    const walletRef = useRef(null);
    // Wallet addresses expanded with their linked-address cluster, so the memo
    // sync and profile subscription cover activity from linked accounts too.
    // Resolved before UpdateHistory's first setLastUpdate re-render so it's
    // set by the time the listeners effect below runs.
    const linkedRef = useRef(null);
    useEffect(() => {(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        walletRef.current = wallet
        await RecentBlock()
        const addresses = wallet.addresses.concat(wallet.changeList)
        linkedRef.current = await SyncProfileLinks({addresses}).catch(async (e) => {
            console.log("Update: SyncProfileLinks failed", e)
            return await window.electron.getLinkedAddresses(addresses)
        })
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        await SyncAliases({addresses: linkedRef.current}).catch(e => console.log("Update: SyncAliases failed", e))
        await UpdateSlp({addresses: addresses.concat(wallet.slpList || []), setLastUpdate})
        await UpdateMemoHistory({addresses: linkedRef.current, setLastUpdate})
        await BackfillPosts({addresses: linkedRef.current, userAddresses: wallet.addresses, setLastUpdate})
    })()}, [])
    useEffect(() => {
        if (!walletRef.current) {
            return
        }
        const closeNewTxs = ListenNewTxs({wallet: walletRef.current, setLastUpdate})
        const closeNewMemos = ListenNewMemos({wallet: walletRef.current,
            addresses: linkedRef.current || undefined, setLastUpdate})
        const closeBlocks = ListenBlocks({addresses: walletRef.current.addresses.concat(
            walletRef.current.changeList, walletRef.current.slpList || []), setLastUpdate, setConnected})
        // Likes and replies aren't wallet transactions - they land on the liked
        // or replied-to post, so ListenNewTxs never sees them and their
        // notifications only appeared on the next manual refresh. Subscribe to
        // the wallet's own posts so a new like/reply pushes the updated post,
        // saves it, and re-triggers the notification fetch live.
        let closeOwnPosts = () => {}
        let cancelled = false
        ;(async () => {
            const addresses = walletRef.current.addresses
            const posts = await window.electron.getPosts({addresses, userAddresses: addresses})
            if (cancelled || !posts.length) {
                return
            }
            closeOwnPosts = ListenPosts({txHashes: posts.map(post => post.tx_hash), setLastUpdate})
        })()
        return () => {
            closeNewTxs()
            closeNewMemos()
            closeBlocks()
            cancelled = true
            closeOwnPosts()
        }

    }, [walletRef.current])
    return (<></>)
}

export default Update
