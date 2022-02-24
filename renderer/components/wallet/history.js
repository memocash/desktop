import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";

const History = () => {
    const [txs, setTxs] = useState([])
    useEffect(async () => {
        let wallet = await GetWallet()
        let txs = await window.electron.getTransactions(wallet.addresses)
        let balance = 0
        for (let i = txs.length - 1; i >= 0; i--) {
            balance += txs[i].value
            txs[i].balance = balance
        }
        setTxs(txs)
    }, [])
    const doubleClickTx = async (txHash) => {
        await window.electron.openPreviewSend({txHash})
    }
    return (
        <div className={styles.wrapper}>
            {!txs.length ?
                <p>No transactions found</p>
                :
                <div className={[styles.row, styles.rowTitle].join(" ")}>
                    <span>Timestamp</span>
                    <span>Hash</span>
                    <span>Value</span>
                    <span>Balance</span>
                </div>
            }
            {txs.map((tx, i) => {
                return (
                    <div className={styles.row} key={i} onDoubleClick={() => doubleClickTx(tx.hash)}>
                        <span>{tx.timestamp}</span>
                        <span>{ShortHash(tx.hash)}</span>
                        <span className={styles.itemValue}>{tx.value.toLocaleString()}</span>
                        <span className={styles.itemValue}>{tx.balance.toLocaleString()}</span>
                    </div>
                )
            })}
        </div>
    )
}

export default History
