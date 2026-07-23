import {useEffect, useRef} from "react";
import GetWallet from "../util/wallet";
import {BackfillPosts, ListenBlocks, ListenNewTxs, ListenPosts, RecentBlock, SyncAliases, SyncProfileLinks, UpdateHistory,
    UpdateMemoDetails, UpdateMemoHistory, UpdateMemoProfile, UpdateSlp} from "./update/index.js";
import ListenNewMemos from "./update/listen_memo";

const Update = ({setConnected, setLastUpdate, setSyncProgress}) => {
    const walletRef = useRef(null);
    // Wallet addresses expanded with their linked-address cluster, so the memo
    // sync and profile subscription cover activity from linked accounts too.
    // Resolved before UpdateHistory's first setLastUpdate re-render so it's
    // set by the time the listeners effect below runs.
    const linkedRef = useRef(null);
    useEffect(() => {(async () => {
        const progress = (percent, label) => setSyncProgress({active: percent < 100, percent, label})
        window.electron.walletLoaded()
        progress(5, "Opening wallet")
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            progress(100, "Wallet ready")
            return
        }
        walletRef.current = wallet
        progress(10, "Connecting to the network")
        await RecentBlock()
        const addresses = wallet.addresses.concat(wallet.changeList)
        progress(15, "Finding linked profiles")
        linkedRef.current = await SyncProfileLinks({addresses}).catch(async (e) => {
            console.log("Update: SyncProfileLinks failed", e)
            return await window.electron.getLinkedAddresses(addresses)
        })
        progress(25, "Loading profile information")
        await UpdateMemoProfile({addresses: linkedRef.current, setLastUpdate})
            .catch(e => console.log("Update: profile sync failed", e))
        progress(35, "Loading transaction history")
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        progress(55, "Loading profile activity")
        await UpdateMemoDetails({addresses: linkedRef.current, setLastUpdate})
            .catch(e => console.log("Update: profile activity sync failed", e))
        progress(70, "Loading aliases")
        await SyncAliases({addresses: linkedRef.current}).catch(e => console.log("Update: SyncAliases failed", e))
        progress(78, "Loading tokens")
        await UpdateSlp({addresses: addresses.concat(wallet.slpList || []), setLastUpdate})
        progress(86, "Loading your recent posts")
        await BackfillPosts({addresses: linkedRef.current, userAddresses: wallet.addresses, setLastUpdate})
        progress(90, "Loading the latest feed")
        const following = await window.electron.getFollowing(linkedRef.current, {limit: null})
        const followedAddresses = [...new Set(following.map(follow => follow.follow_address))]
        if (followedAddresses.length) {
            // The feed component also refreshes itself during normal use, but
            // startup must await this first refresh so reaching 100% means the
            // posts revealed behind the overlay are current.
            await UpdateMemoHistory({addresses: followedAddresses, setLastUpdate})
            await BackfillPosts({
                addresses: followedAddresses,
                userAddresses: wallet.addresses,
                setLastUpdate,
            })
        }
        progress(100, "Wallet ready")
    })().catch(e => {
        console.log("Update: initial wallet sync failed", e)
    }).finally(() => {
        // Individual panes retain their existing saved-data/error treatments;
        // never strand the user behind the startup screen if a remote phase
        // fails unexpectedly.
        setSyncProgress({active: false, percent: 100, label: "Wallet ready"})
    })}, [])
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
