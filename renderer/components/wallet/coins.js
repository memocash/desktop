import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";

const Coins = () => {
    const [coins, setCoins] = useState([])
    useEffect(async () => {
        const wallet = await GetWallet()
        const coins = await window.electron.getCoins(wallet.addresses)
        setCoins(coins)
    }, [])
    return (
        <div className={styles.wrapper}>
            {!coins.length ?
                <p>No coins</p>
                :
                <div className={[styles.row, styles.rowTitle].join(" ")}>
                    <span>Address</span>
                    <span>Amount</span>
                    <span>Height</span>
                    <span>Output</span>
                </div>
            }
            {coins.map((coin, i) => {
                return (
                    <div key={i} className={[styles.row].join(" ")}>
                        <span>{coin.address}</span>
                        <span className={styles.itemValue}>{coin.value.toLocaleString()}</span>
                        <span className={styles.itemValue}>{coin.height.toLocaleString()}</span>
                        <span title={coin.hash + ":" + coin.index}>{ShortHash(coin.hash)}:{coin.index}</span>
                    </div>
                )
            })}
        </div>
    )
}

export default Coins
