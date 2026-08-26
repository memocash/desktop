import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";
import {FormatTokenAmount} from "../util/slp";
import {TitleCol} from "./snippets/title_col";
import {useReferredState} from "../util/state";
import {useResizableColumns} from "./snippets/use_columns";
import {Loading} from "../util/loading";
import {EmptyState} from "../util/empty";
import {BsCoin, BsThreeDots} from "../util/icons";
import {useScopeActivity} from "../util/activity";
import {Tabs} from "../../../main/common/util";

const Column = {
    Address: "address",
    Value: "value",
    Height: "height",
    Token: "slp_ticker",
    Output: "hash",
}

const UnconfirmedValue = "Unconfirmed"

const Coins = ({lastUpdate}) => {
    const [loaded, setLoaded] = useState(false)
    const [coins, coinsRef, setCoins] = useReferredState([])
    const [selectedOutput, selectedOutputRef, setSelectedOutput] = useReferredState("")
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Height)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    const coinsDiv = useRef()
    const columns = useResizableColumns(5)
    // Coins are still being downloaded: "no coins yet" would be wrong until
    // the transactions they come from have landed.
    const activity = useScopeActivity(Tabs.Coins)
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const coins = await window.electron.getCoins(wallet.addresses.concat(wallet.changeList, wallet.slpList || []))
        for (let i = 0; i < coins.length; i++) {
            if (!coins[i].height) {
                coins[i].height = UnconfirmedValue
            }
        }
        setCoins(coins)
        setLoaded(true)
        sortCoins()
    })()}, [lastUpdate])
    const sortCoins = (field) => {
        let desc = sortDescRef.current
        if (!field || !field.length) {
            // If no field set, use current values
            field = sortColRef.current
        } else if (sortColRef.current === field) {
            desc = !desc
        } else {
            // Default false, except for hash column
            desc = field === Column.Output
        }
        const ret = desc ? 1 : -1
        coinsRef.current.sort((a, b) => {
            if (a[field] === b[field]) {
                return 0
            } else if (a[field] === UnconfirmedValue) {
                return ret
            } else if (b[field] === UnconfirmedValue) {
                return -ret
            }
            return a[field] > b[field] ? ret : -ret
        })
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
    const getCoinToken = (coin) => {
        if (!coin.slp_baton_token_hash && !coin.slp_token_hash) {
            return ""
        }
        // A token or baton annotation is only real when the index calls its
        // transaction VALID. INVALID means the SLP claim did not hold and the
        // row carries nothing on chain; anything undecided has not been
        // confirmed. Either way the label must not read as spendable tokens.
        const suffix = coin.slp_validity === "VALID" ? "" :
            coin.slp_validity === "INVALID" ? " (invalid)" : " (unconfirmed)"
        if (coin.slp_baton_token_hash) {
            return "Baton: " + (coin.slp_ticker || ShortHash(coin.slp_baton_token_hash)) + suffix
        }
        return FormatTokenAmount(coin.slp_amount, coin.slp_decimals) + " " +
            (coin.slp_ticker || ShortHash(coin.slp_token_hash)) + suffix
    }
    const openCoinMenu = (e, coin) => {
        e.preventDefault()
        e.stopPropagation()
        window.electron.coinsMenu(coin.hash, coin.index, coin.value, coin.address)
    }
    const keyDownHandler = async (e) => {
        let selectedOutput = selectedOutputRef.current
        if (!selectedOutput || !selectedOutput.length) {
            return
        }
        const coins = coinsRef.current
        switch (e.key) {
            case "ArrowUp":
                for (let i = 1; i < coins.length; i++) {
                    if (getCoinOutput(coins[i]) === selectedOutput) {
                        selectedOutput = getCoinOutput(coins[i - 1])
                        break
                    }
                }
                break
            case "ArrowDown":
                for (let i = 0; i < coins.length - 1; i++) {
                    if (getCoinOutput(coins[i]) === selectedOutput) {
                        selectedOutput = getCoinOutput(coins[i + 1])
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
            if (cur.childNodes[i].childNodes[4].innerText.substr(0, 5) === hashPrefix) {
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
        <div className={styles.wrapper} style={{gridTemplateColumns: columns.gridTemplateColumns}}
             onKeyDown={keyDownHandler} ref={(el) => {
                 coinsDiv.current = el
                 columns.gridRef.current = el
             }}>
            {!coins.length ?
                (loaded && !activity.busy ?
                    <EmptyState icon={<BsCoin/>} title={"No coins yet"}>
                        Unspent outputs appear here once this wallet receives a payment.
                    </EmptyState> :
                    <Loading>{activity.busy ? activity.label : "Loading coins..."}</Loading>)
                :
                <div className={[styles.row, styles.rowTitle].join(" ")}>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol} index={0} columns={columns}
                              col={Column.Address} title={"Address"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol} index={1} columns={columns}
                              col={Column.Value} title={"Value"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol} index={2} columns={columns}
                              col={Column.Height} title={"Height"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol} index={3} columns={columns}
                              col={Column.Token} title={"Token"}/>
                    <TitleCol sortFunc={sortCoins} desc={sortDesc} sortCol={sortCol} index={4} columns={columns}
                              col={Column.Output} title={"Output"}/>
                    <span/>
                </div>
            }
            {coins.map((coin, i) => {
                return (
                    <div key={i} onClick={(e) => clickRow(e, getCoinOutput(coin))}
                         onDoubleClick={() => doubleClickTx(coin.hash)}
                         onContextMenu={(e) => openCoinMenu(e, coin)}
                         className={[styles.row, selectedOutput === getCoinOutput(coin) && styles.rowSelected].join(" ")}>
                        <span className={styles.itemAddress}>{coin.address}</span>
                        <span className={styles.itemValue}>{coin.value.toLocaleString()}</span>
                        <span className={styles.itemValue}>{coin.height.toLocaleString()}</span>
                        <span title={coin.slp_token_hash || coin.slp_baton_token_hash}>{getCoinToken(coin)}</span>
                        <span title={coin.hash + ":" + coin.index}>{ShortHash(coin.hash)}:{coin.index}</span>
                        <span>
                            <button className={styles.rowMenu} title={"Coin actions"} aria-label={"Coin actions"}
                                    onClick={(e) => openCoinMenu(e, coin)}><BsThreeDots/></button>
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

export default Coins
