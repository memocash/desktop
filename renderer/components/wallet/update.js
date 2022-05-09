import {useEffect} from "react";
import GetWallet from "../util/wallet";
import {UpdateHistory, ListenNewTxs} from "./snippets/update";

const Update = ({setConnected, setLastUpdate}) => {
    useEffect(async () => {
        window.electron.walletLoaded()
        let wallet = await GetWallet()
        if (!wallet.addresses || !wallet.addresses.length) {
            console.log("ERROR: Addresses not loaded")
            return
        }
        await UpdateHistory({wallet, setConnected, setLastUpdate})
        await ListenNewTxs({wallet, setLastUpdate})
    }, [])
    return (<></>)
}

export default Update
