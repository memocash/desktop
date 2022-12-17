import {useEffect, useRef} from "react";
import GetWallet from "../util/wallet";
import {ListenBlocks, ListenNewTxs, RecentBlock, UpdateHistory, UpdateMemoHistory} from "./update/index.js";
import ListenNewMemos from "./update/listen_memo";

const Update = ({setConnected, setLastUpdate}) => {
    const walletRef = useRef(null);
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        walletRef.current = wallet
        await RecentBlock()
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        await UpdateMemoHistory({addresses: wallet.addresses.concat(wallet.changeList), setLastUpdate})

    }, [])
    useEffect(() => {
        if (!walletRef.current) {
            return
        }
        const closeNewTxs = ListenNewTxs({wallet: walletRef.current, setLastUpdate})
        const closeNewMemos = ListenNewMemos({wallet: walletRef.current, setLastUpdate})
        const closeBlocks = ListenBlocks({addresses: walletRef.current.addresses.concat(walletRef.current.changeList), setLastUpdate, setConnected})
        return () => {
            closeNewTxs()
            closeNewMemos()
            closeBlocks()
        }

    }, [walletRef.current])
    return (<></>)
}

export default Update
