import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";

const History = () => {
    const [txs, setTxs] = useState([])
    const [selectedTxHash, setSelectedTxHash] = useState("")
    useEffect(async () => {
        let wallet = await GetWallet()
        let txs = await window.electron.getTransactions(wallet.addresses)
        let balance = 0
        for (let i = txs.length - 1; i >= 0; i--) {
            balance += txs[i].value
            txs[i].balance = balance
        }
        setTxs(txs)
        document.addEventListener("keydown", (e) => {
            setSelectedTxHash(selectedTxHash => {
                if (!selectedTxHash || !selectedTxHash.length) {
                    return
                }
                switch (e.key) {
                    case "ArrowUp":
                        for (let i = 1; i < txs.length; i++) {
                            if (txs[i].hash === selectedTxHash) {
                                selectedTxHash = txs[i - 1].hash
                                break
                            }
                        }
                        break
                    case "ArrowDown":
                        for (let i = 0; i < txs.length - 1; i++) {
                            if (txs[i].hash === selectedTxHash) {
                                selectedTxHash = txs[i + 1].hash
                                break
                            }
                        }
                        break
                }
                return selectedTxHash
            })
        }, false)
    }, [])
    const doubleClickTx = async (txHash) => {
        await window.electron.openPreviewSend({txHash})
    }
    const clickRow = (e, txHash) => {
        e.stopPropagation()
        setSelectedTxHash(txHash)
    }
    const clickWrapper = () => {
        setSelectedTxHash("")
    }
    return (
        <div className={styles.wrapper} onClick={clickWrapper}>
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
                    <div key={i} className={[styles.row, selectedTxHash === tx.hash && styles.rowSelected].join(" ")}
                         onClick={(e) => clickRow(e, tx.hash)} onDoubleClick={() => doubleClickTx(tx.hash)}>
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
