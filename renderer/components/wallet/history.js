import {useEffect, useState} from "react";

const History = () => {
    const [txs, setTxs] = useState([])
    useEffect(async () => {
        setTxs(await window.electron.getTransactions())
    }, [])
    return (
        <div>
            {!txs.length && <p>No transactions found</p>}
            {txs.map((tx, i) => {
                return (
                    <p key={i}>{i}: {tx.hash}</p>
                )
            })}
        </div>
    )
}

export default History
