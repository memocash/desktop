import {useEffect, useRef} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";
import {TitleCol} from "./snippets/title-col";
import {useReferredState} from "../util/state";

const Column = {
    Address: "address",
    Value: "value",
    Height: "height",
    Output: "output",
}

const Coins = () => {
    const [coins, coinsRef, setCoins] = useReferredState([])
    const [selectedOutput, selectedOutputRef, setSelectedOutput] = useReferredState("")
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Address)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const coinsDiv = useRef()
    useEffect(async () => {
        const wallet = await GetWallet()
        const coins = await window.electron.getCoins(wallet.addresses)
        setCoins(coins)
    }, [])
    const sortCoins = (field) => {
        let desc = sortDescRef.current
        if (sortColRef.current === field) {
            desc = !desc
        } else {
            // Default false, except for hash column
            desc = field === Column.Output
        }
        if (desc) {
            coinsRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            coinsRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setCoins([...coinsRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    const clickRow = (e, txHash) => {
        e.stopPropagation()
        setSelectedOutput(txHash)
    }
    const doubleClickTx = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const getCoinOutput = (coin) => {
        return coin.hash + ":" + coin.index
    }
    const keyDownHandler = async (e) => {
        let selectedOutput = selectedOutputRef.current
        if (!selectedOutput || !selectedOutput.length) {
            return
        }
        const coins = coinsRef.current
        switch (e.key) {
            case "ArrowUp":
                for (let i = 1; i < txs.length; i++) {
                    if (getCoinOutput(coins[i]) === selectedOutput) {
                        selectedOutput = getCoinOutput(coins[i - 1])
                        break
                    }
                }
                break
            case "ArrowDown":
                for (let i = 0; i < coins.length - 1; i++) {
                    if (getCoinOutput(coins[i]) === selectedTxHash) {
                        selectedOutput = getCoinOutput([i + 1])
                        break
                    }
                }
                break
            case "Escape":
                selectedOutput = ""
                break
            case "Enter":
                await window.electron.openTransaction({txHash: selectedOutput.substr(0, 64)})
                break
            default:
                return
        }
        e.preventDefault()
        const cur = coinsDiv.current
        const clientHeight = cur.parentNode.clientHeight
        const scrollTop = cur.parentNode.scrollTop
        const hashPrefix = selectedOutput.substr(0, 5)
        for (let i = 1; i < cur.childNodes.length; i++) {
            if (cur.childNodes[i].childNodes[3].innerText.substr(0, 5) === hashPrefix) {
                const offsetTop = cur.childNodes[i].childNodes[0].offsetTop
                if (offsetTop < scrollTop + 60) {
                    cur.parentNode.scrollTop = offsetTop - 60
                }
                if (offsetTop > clientHeight + scrollTop) {
                    cur.parentNode.scrollTop = offsetTop - clientHeight - 11
                }
                break
            }
        }
        setSelectedOutput(selectedOutput)
    }
    return (
        <div className={styles.wrapper} onKeyDown={keyDownHandler} ref={coinsDiv}>
            {!coins.length ?
                <p>No coins</p>
                :
                <div className={[styles.row, styles.rowTitle].join(" ")}>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol}
                              col={Column.Address} title={"Address"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol}
                              col={Column.Value} title={"Value"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol}
                              col={Column.Height} title={"Height"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol}
                              col={Column.Output} title={"Output"}/>
                </div>
            }
            {coins.map((coin, i) => {
                return (
                    <div key={i} onClick={(e) => clickRow(e, coin.hash)} onDoubleClick={() => doubleClickTx(coin.hash)}
                         className={[styles.row, selectedOutput === getCoinOutput(coin) && styles.rowSelected].join(" ")}>
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
