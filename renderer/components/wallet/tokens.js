import {useEffect, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import ShortHash from "../util/txs";
import {FormatTokenAmount} from "../util/slp";
import {TitleCol} from "./snippets/title_col";
import {useReferredState} from "../util/state";
import {Modals} from "../../../main/common/util";

const Column = {
    Ticker: "ticker",
    Name: "name",
    Amount: "amount",
    UtxoCount: "utxo_count",
    Token: "token_hash",
}

const Tokens = ({lastUpdate, setModal}) => {
    const [loaded, setLoaded] = useState(false)
    const [tokens, tokensRef, setTokens] = useReferredState([])
    const [selectedToken, selectedTokenRef, setSelectedToken] = useReferredState("")
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Ticker)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(false)
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const tokens = await window.electron.getTokenBalances(wallet.addresses.concat(wallet.changeList, wallet.slpList || []))
        setTokens(tokens)
        setLoaded(true)
        sortTokens()
    })()}, [lastUpdate])
    const sortTokens = (field) => {
        let desc = sortDescRef.current
        if (!field || !field.length) {
            // If no field set, use current values
            field = sortColRef.current
        } else if (sortColRef.current === field) {
            desc = !desc
        } else {
            desc = field === Column.Amount || field === Column.UtxoCount
        }
        const ret = desc ? 1 : -1
        tokensRef.current.sort((a, b) => {
            if (a[field] === b[field]) {
                return 0
            } else if (a[field] === null || a[field] === undefined) {
                return ret
            } else if (b[field] === null || b[field] === undefined) {
                return -ret
            }
            return a[field] > b[field] ? ret : -ret
        })
        setTokens([...tokensRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    const openSend = (token) => {
        setModal(Modals.TokenSend, {token})
    }
    const clickSend = () => {
        const token = tokensRef.current.find(token => token.token_hash === selectedTokenRef.current)
        if (token) {
            openSend(token)
        }
    }
    return (
        <div>
            <p>
                <input type="button" value={"Send"} disabled={!selectedToken.length} onClick={clickSend}
                       title={"Select a token to send (or double-click a row)"}/>
            </p>
            <div className={[styles.wrapper, styles.wrapper5Even].join(" ")}>
            {!tokens.length ?
                <p className={styles.message}>{loaded ? <>No tokens</> : <>Loading...</>}</p>
                :
                <div className={[styles.row, styles.rowTitle].join(" ")}>
                    <TitleCol sortFunc={sortTokens} desc={sortDesc} sortCol={sortCol}
                              col={Column.Ticker} title={"Ticker"}/>
                    <TitleCol sortFunc={sortTokens} desc={sortDesc} sortCol={sortCol}
                              col={Column.Name} title={"Name"}/>
                    <TitleCol sortFunc={sortTokens} desc={sortDesc} sortCol={sortCol}
                              col={Column.Amount} title={"Balance"}/>
                    <TitleCol sortFunc={sortTokens} desc={sortDesc} sortCol={sortCol}
                              col={Column.UtxoCount} title={"UTXOs"}/>
                    <TitleCol sortFunc={sortTokens} desc={sortDesc} sortCol={sortCol}
                              col={Column.Token} title={"Token"}/>
                </div>
            }
            {tokens.map((token, i) => {
                return (
                    <div key={i} onClick={() => setSelectedToken(token.token_hash)}
                         onDoubleClick={() => openSend(token)}
                         className={[styles.row, selectedToken === token.token_hash && styles.rowSelected].join(" ")}>
                        <span>{token.ticker || ShortHash(token.token_hash)}</span>
                        <span>{token.name}</span>
                        <span className={styles.itemValue}>{FormatTokenAmount(token.amount, token.decimals)}</span>
                        <span className={styles.itemValue}>{token.utxo_count.toLocaleString()}</span>
                        <span title={token.token_hash}>{ShortHash(token.token_hash)}</span>
                    </div>
                )
            })}
            </div>
        </div>
    )
}

export default Tokens
