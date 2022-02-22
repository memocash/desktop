import {useEffect, useState} from "react";

const History = () => {
    const [txs, setTxs] = useState([])
    useEffect(async () => {
        setTxs(await window.electron.getTransactions())
    }, [])
    return (
        <div>
            <h2>History</h2>
            {txs.map((tx, i) => {
                return (
                    <p key={i}>{i}: {tx.hash}</p>
                )
            })}
        </div>
    )
}

export default History
