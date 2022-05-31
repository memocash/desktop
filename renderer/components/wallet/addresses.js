import {useEffect, useRef, useState} from "react";
import GetWallet from "../util/wallet";
import styles from "../../styles/history.module.css";
import {TitleCol} from "./snippets/title-col";
import {useReferredState} from "../util/state";

const Column = {
    Index: "index",
    Address: "address",
    Balance: "balance",
}

const Addresses = () => {
    const [addresses, addressesRef, setAddresses] = useReferredState([])
    const [sortCol, sortColRef, setSortCol] = useReferredState(Column.Index)
    const [sortDesc, sortDescRef, setSortDesc] = useReferredState(true)
    const [selectedAddress, selectedAddressRef, setSelectedAddress] = useReferredState("")
    const addressesDiv = useRef()
    useEffect(async () => {
        window.electron.walletLoaded()
        const wallet = await GetWallet()
        const balances = await loadBalance(wallet.addresses)
        for (let i = 0; i < balances.length; i++) {
            balances[i].index = i
        }
        setAddresses(balances)
    }, [])

    const loadBalance = async (addresses) => {
        const query = `
    query ($addresses: [String!]) {
        addresses(addresses: $addresses) {
            address
            balance
        }
    }
    `
        let data = await window.electron.graphQL(query, {
            addresses: addresses,
        })
        console.log(data)
        return data.data.addresses
    }
    const keyDownHandler = async (e) => {
        let selectedAddress = selectedAddressRef.current
        if (!selectedAddress || !selectedAddress.length) {
            return
        }
        const addresses = addressesRef.current
        switch (e.key) {
            case "ArrowUp":
                for (let i = 1; i < addresses.length; i++) {
                    if (addresses[i].address === selectedAddress) {
                        selectedAddress = addresses[i - 1].address
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
    const sortAddresses = (field) => {
        let desc = sortDescRef.current
        desc = !desc
        if (desc) {
            addressesRef.current.sort((a, b) => (a[field] > b[field]) ? 1 : -1)
        } else {
            addressesRef.current.sort((a, b) => (a[field] < b[field]) ? 1 : -1)
        }
        setAddresses([...addressesRef.current])
        setSortDesc(desc)
        setSortCol(field)
    }
    return (
        <div>
            <div className={[styles.wrapper, styles.wrapper3].join(" ")} onClick={clickWrapper}
                 onKeyDown={keyDownHandler} tabIndex={-1}
                 ref={addressesDiv}>
                {!addresses.length ?
                    <p className={styles.message}>Generating addresses, please wait...</p>
                    :
                    <div className={[styles.row, styles.rowTitle].join(" ")}>
                        <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol}
                                  col={Column.Index} title={"Id"}/>
                        <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol}
                                  col={Column.Address} title={"Address"}/>
                        <TitleCol sortFunc={sortAddresses} desc={sortDesc} sortCol={sortCol}
                                  col={Column.Balance} title={"Balance"}/>
                    </div>
                }
                {addresses.map((address, i) => {
                    return (
                        <div key={i} onClick={(e) => clickRow(e, address.address)}
                             className={[styles.row, selectedAddress === address.address && styles.rowSelected].join(" ")}
                             onDoubleClick={() => doubleClickAddress(address.address)}>
                            <span>{address.index}</span>
                            <span>{address.address}</span>
                            <span className={styles.itemValue}>{address.balance.toLocaleString()}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default Addresses
