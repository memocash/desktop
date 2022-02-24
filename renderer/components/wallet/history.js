import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";

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
    return (
        <div>
            {!txs.length && <p>No transactions found</p>}
            {txs.map((tx, i) => {
                return (
                    <p key={i}>{i}: {tx.hash} - {tx.timestamp} - {tx.value} - {tx.balance}</p>
                )
            })}
        </div>
    )
}

export default History
