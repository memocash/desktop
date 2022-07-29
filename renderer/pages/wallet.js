import Frame, {Tabs} from "../components/wallet/frame";
import {Addresses, History, Send, Receive, Coins, Update, Memo} from "../components/wallet";
import {useEffect, useRef, useState} from "react";
import {Status} from "../components/util/connect"

const StorageKeyWalletTab = "wallet-tab"

const Page = ({tab, page, shown, children}) => {
    const includePage = tab === page || shown.current.includes(page)
    const style = {height: "calc(100% - 32px)"}
    if (includePage && tab !== page) {
        style.display = "none"
    }
    return (
        <>
            {includePage && (
                <div style={style}>
                    {children}
                </div>
            )}
        </>
    )
}

const WalletLoaded = () => {
    const [tab, setTab] = useState("")
    const [lastUpdate, setLastUpdate] = useState("")
    const [connected, setConnected] = useState(Status.NotConnected)
    const [profileAddress, setProfileAddress] = useState("")
    const shownRef = useRef([])
    useEffect(async () => {
        const tab = await window.electron.getWindowStorage(StorageKeyWalletTab) || Tabs.Memo
        setTab(tab)
        shownRef.current.push(tab)
    }, [])
    const handleClicked = (tab) => {
        setTab(tab)
        window.electron.setWindowStorage(StorageKeyWalletTab, tab)
        if (!shownRef.current.includes(tab)) {
            shownRef.current.push(tab)
        }
    }
    const viewProfile = async (address) => {
        setTab(Tabs.Memo)
        setProfileAddress(address)
    }
    return (
        <>
            <Frame selected={tab} clicked={handleClicked} connected={connected} lastUpdate={lastUpdate}
                   viewProfile={viewProfile}>
                <Page tab={tab} page={Tabs.Memo} shown={shownRef}>
                    <Memo lastUpdate={lastUpdate} address={profileAddress} setAddress={setProfileAddress}/></Page>
                <Page tab={tab} page={Tabs.History} shown={shownRef}><History lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Send} shown={shownRef}><Send lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Receive} shown={shownRef}><Receive/></Page>
                <Page tab={tab} page={Tabs.Addresses} shown={shownRef}><Addresses lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Coins} shown={shownRef}><Coins lastUpdate={lastUpdate}/></Page>
            </Frame>
            <Update setConnected={setConnected} setLastUpdate={setLastUpdate}/>
        </>
    )
}

export default WalletLoaded
