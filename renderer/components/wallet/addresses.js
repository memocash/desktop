import {Fragment, useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import {FormatTokenAmount} from "../util/slp";
import {TitleCol} from "./snippets/title_col";
import {useReferredState} from "../util/state";
import ShortHash from "../util/txs";
import {useResizableColumns} from "./snippets/use_columns";
import {BsThreeDots} from "../util/icons";
import {Loading} from "../util/loading";

// Most of a wallet's derived addresses are never used, so each section lists
// the funded ones plus a few empties to receive into, rather than every
// address the wallet has generated.
const EmptyAddressesShown = 5

const trimEmpty = (addresses) => {
    let empty = 0
    return addresses.filter(address => {
        if (address.balance) {
            return true
        }
        empty++
        return empty <= EmptyAddressesShown
    })
}

const Column = {
    Index: "index",
    Address: "address",
    Balance: "balance",
}

// The rows a section shows are picked in derivation order and only then
// sorted, so a sort reorders what is already on screen instead of pulling in
// different empty addresses from further down the wallet.
const visibleRows = (addresses, col, desc) => trimEmpty(addresses).sort(
    (a, b) => ((desc ? a[col] > b[col] : a[col] < b[col]) ? 1 : -1))

const Addresses = ({lastUpdate}) => {
    const [addresses, addressesRef, setAddresses] = useReferredState([])
    const [changeList, changeListRef, setChangeList] = useReferredState([])
    const [slpList, setSlpList] = useState([])
    const [slpTokens, setSlpTokens] = useState({})
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Index)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(true)
    const [selectedAddress, selectedAddressRef, setSelectedAddress] = useReferredState("")
    const addressesDiv = useRef()
    const columns = useResizableColumns(3)
    useEffect(() => {
        window.electron.walletLoaded()
    }, [])
    // Same menu for a right-click anywhere on the row and for the row's "..."
    // button, which is what makes the menu discoverable without a right-click.
    const openAddressMenu = async (e, address) => {
        e.preventDefault()
        e.stopPropagation()
        if (!address) {
            return
        }
        setSelectedAddress(address)
        await window.electron.rightClickMenu(address, await GetWallet())
    }
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        try {
            const balances = await getBalances(wallet.addresses)
            let changeBalances = []
            if (wallet.changeList && wallet.changeList.length) {
                changeBalances = await getBalances(wallet.changeList)
            }
            let slpBalances = []
            let tokensByAddress = {}
            if (wallet.slpList && wallet.slpList.length) {
                slpBalances = await getBalances(wallet.slpList)
                const addressTokens = await window.electron.getAddressTokenBalances(wallet.slpList)
                for (let i = 0; i < addressTokens.length; i++) {
                    if (!tokensByAddress[addressTokens[i].address]) {
                        tokensByAddress[addressTokens[i].address] = []
                    }
                    tokensByAddress[addressTokens[i].address].push(addressTokens[i])
                }
            }
            setAddresses(balances)
            setChangeList(changeBalances)
            setSlpList(slpBalances)
            setSlpTokens(tokensByAddress)
        } catch (e) {
            console.log(e)
        }
    })()}, [lastUpdate])
    const getBalances = async (addresses) => {
        const balances = await window.electron.getWalletInfo(addresses)
        let allBalances = []
        for (let i = 0; i < addresses.length; i++) {
            let balance = 0
            for (let j = 0; j < balances.length; j++) {
                if (balances[j].address === addresses[i]) {
                    balance = balances[j].balance
                }
            }
            allBalances.push({
                address: addresses[i],
                index: i,
                balance: balance,
            })
        }
        return allBalances
    }
    const keyDownHandler = async (e) => {
        let selectedAddress = selectedAddressRef.current
        if (!selectedAddress || !selectedAddress.length) {
            return
        }
        // Arrow keys move between the rows on screen, so they walk the same
        // trimmed and sorted lists the sections render.
        const addresses = visibleRows(addressesRef.current, sortColRef.current, sortDescRef.current)
        const changeList = visibleRows(changeListRef.current, sortColRef.current, sortDescRef.current)
        switch (e.key) {
            case "ArrowUp":
                for (let i = 1; i < addresses.length; i++) {
                    if (addresses[i].address === selectedAddress) {
                        selectedAddress = addresses[i - 1].address
                        break
                    }
                }
                for (let i = 1; i < changeList.length; i++) {
                    if (changeList[i].address === selectedAddress) {
                        selectedAddress = changeList[i - 1].address
                        break
                    }
                }
                break
            case "ArrowDown":
                for (let i = 0; i < addresses.length - 1; i++) {
                    if (addresses[i].address === selectedAddress) {
                        selectedAddress = addresses[i + 1].address
                        break
                    }
                }
                for (let i = 0; i < changeList.length - 1; i++) {
                    if (changeList[i].address === selectedAddress) {
                        selectedAddress = changeList[i + 1].address
                        break
                    }
                }
                break
            case "Escape":
                selectedAddress = ""
                break
            default:
                return
        }
        e.preventDefault()
        const cur = addressesDiv.current
        const clientHeight = cur.parentNode.clientHeight
        const scrollTop = cur.parentNode.scrollTop
        for (let i = 1; i < cur.childNodes.length; i++) {
            if (cur.childNodes[i].childNodes[1].innerText === selectedAddress) {
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
        setSelectedAddress(selectedAddress)
    }
    const clickRow = (e, address) => {
        e.stopPropagation()
        setSelectedAddress(address)
    }
    const clickWrapper = () => {
        setSelectedAddress("")
    }
    // The sort headers are repeated on each section but share one column and
    // direction, so a click re-sorts every section, not just the one clicked.
    // The lists themselves stay in derivation order; each section sorts the
    // rows it shows when it renders.
    const sortAddresses = (field) => {
        setSortDesc(!sortDescRef.current)
        setSortCol(field)
    }
    const sectionProps = {sortAddresses, sortDesc, sortCol, columns, selectedAddress, clickRow, openAddressMenu}
    return (
        <div>
            <div className={styles.wrapper} style={{gridTemplateColumns: columns.gridTemplateColumns}}
                 onClick={clickWrapper} onKeyDown={keyDownHandler} tabIndex={-1}
                 ref={(el) => {
                     addressesDiv.current = el
                     columns.gridRef.current = el
                 }}>
                {!addresses.length && !changeList.length ?
                    <Loading>Generating addresses, please wait...</Loading> : null}
                <Section title={"Address"} addresses={addresses} {...sectionProps}/>
                <Section title={"Change Address"} addresses={changeList} {...sectionProps}/>
                <Section title={"SLP Address"} addresses={slpList} {...sectionProps}
                         tokensFor={(address) => slpTokens[address] || []}/>
            </div>
        </div>)
}

const Section = ({title, addresses, tokensFor, sortAddresses, sortDesc, sortCol, columns, selectedAddress,
                     clickRow, openAddressMenu}) => {
    if (!addresses.length) {
        return null
    }
    const shown = visibleRows(addresses, sortCol, sortDesc)
    return (
        <>
            <div className={[styles.row, styles.rowTitle].join(" ")}>
                <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol} index={0} columns={columns}
                          col={Column.Index} title={"Id"}/>
                <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol} index={1} columns={columns}
                          col={Column.Address} title={title}/>
                <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol} index={2} columns={columns}
                          col={Column.Balance} title={"Balance"}/>
                <span/>
            </div>
            {shown.map((address, i) => (
                <Fragment key={i}>
                    <div data-address={address.address} onClick={(e) => clickRow(e, address.address)}
                         onContextMenu={(e) => openAddressMenu(e, address.address)}
                         className={[styles.row,
                             selectedAddress === address.address && styles.rowSelected].filter(c => c).join(" ")}>
                        <span>{address.index}</span>
                        <span className={styles.itemAddress}>{address.address}</span>
                        <span className={styles.itemValue}>{address.balance.toLocaleString()}</span>
                        <span>
                            <button className={styles.rowMenu} title={"Address actions"}
                                    aria-label={"Address actions"}
                                    onClick={(e) => openAddressMenu(e, address.address)}><BsThreeDots/></button>
                        </span>
                    </div>
                    {(tokensFor ? tokensFor(address.address) : []).map((token, j) => (
                        <div key={j} className={styles.row}>
                            <span/>
                            <span title={token.token_hash} style={{paddingLeft: "30px"}}>
                                {token.ticker || ShortHash(token.token_hash)}
                                {token.name ? " (" + token.name + ")" : ""}
                            </span>
                            <span className={styles.itemValue}>
                                {FormatTokenAmount(token.amount, token.decimals)}
                            </span>
                            <span/>
                        </div>
                    ))}
                </Fragment>
            ))}
        </>
    )
}

export default Addresses
