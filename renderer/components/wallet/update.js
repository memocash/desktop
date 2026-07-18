import {useEffect, useRef} from "react";
import GetWallet from "../util/wallet";
import {BackfillPosts, ListenBlocks, ListenNewTxs, RecentBlock, UpdateHistory, UpdateMemoHistory, UpdateSlp} from "./update/index.js";
import ListenNewMemos from "./update/listen_memo";

const Update = ({setConnected, setLastUpdate}) => {
    const walletRef = useRef(null);
    useEffect(() => {(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        walletRef.current = wallet
        await RecentBlock()
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        const addresses = wallet.addresses.concat(wallet.changeList)
        await UpdateSlp({addresses: addresses.concat(wallet.slpList || []), setLastUpdate})
        await UpdateMemoHistory({addresses, setLastUpdate})
        await BackfillPosts({addresses, userAddresses: wallet.addresses, setLastUpdate})
    })()}, [])
    useEffect(() => {
        if (!walletRef.current) {
            return
        }
        const closeNewTxs = ListenNewTxs({wallet: walletRef.current, setLastUpdate})
        const closeNewMemos = ListenNewMemos({wallet: walletRef.current, setLastUpdate})
        const closeBlocks = ListenBlocks({addresses: walletRef.current.addresses.concat(
            walletRef.current.changeList, walletRef.current.slpList || []), setLastUpdate, setConnected})
        return () => {
            closeNewTxs()
            closeNewMemos()
            closeBlocks()
        }

    }, [walletRef.current])
    return (<></>)
}

export default Update
