import {useEffect} from "react";
import GetWallet from "../util/wallet";
import {UpdateHistory, ListenNewTxs, ListenBlocks, RecentBlock, UpdateMemoHistory} from "./snippets/update";
import ListenNewMemos from "./snippets/update/listen_memo";

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
        await UpdateMemoHistory({wallet, setLastUpdate})
        ListenNewTxs({wallet, setLastUpdate})
        ListenNewMemos({wallet, setLastUpdate})
        ListenBlocks({addresses: wallet.addresses, setLastUpdate, setConnected})
    }, [])
    return (<></>)
}

export default Update
