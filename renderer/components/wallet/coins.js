import {useEffect} from "react";
import GetWallet from "../util/wallet";

const Coins = () => {
    useEffect(async () => {
        const wallet = await GetWallet()
        const coins = await window.electron.getCoins(wallet.addresses)
        console.log(coins)
    }, [])
    return (
        <div>
            <h2>Coins</h2>
        </div>
    )
}

export default Coins
