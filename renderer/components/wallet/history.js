import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";

const History = () => {
    const [txs, setTxs] = useState([])
    useEffect(async () => {
        let wallet = await GetWallet()
        setTxs(await window.electron.getTransactions(wallet.addresses))
    }, [])
    return (
        <div>
            {!txs.length && <p>No transactions found</p>}
            {txs.map((tx, i) => {
                return (
                    <p key={i}>{i}: {tx.hash} - {tx.timestamp} - {tx.value}</p>
                )
            })}
        </div>
    )
}

export default History
