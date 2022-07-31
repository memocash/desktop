import {useEffect} from "react";
import GetWallet from "../util/wallet";
import {UpdateHistory, ListenNewTxs, ListenBlocks, RecentBlock, UpdateMemoHistory} from "./update/index.js";
import ListenNewMemos from "./update/listen_memo";
import addresses from "../util/addresses";

const Update = ({setConnected, setLastUpdate}) => {
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        await RecentBlock()
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        await UpdateMemoHistory({addresses: wallet.addresses, setLastUpdate})
        ListenNewTxs({wallet, setLastUpdate})
        ListenNewMemos({wallet, setLastUpdate})
        ListenBlocks({addresses: wallet.addresses, setLastUpdate, setConnected})
    }, [])
    return (<></>)
}

export default Update
