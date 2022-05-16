import {useEffect} from "react";
import GetWallet from "../util/wallet";
import {UpdateHistory, ListenNewTxs, ListenBlocks, RecentBlock} from "./snippets/update";

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
        ListenNewTxs({wallet, setLastUpdate})
        ListenBlocks({setLastUpdate})
    }, [])
    return (<></>)
}

export default Update
