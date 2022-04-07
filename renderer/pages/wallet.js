import Frame, {Tabs} from "../components/wallet/frame";
import Addresses from "../components/wallet/addresses";
import {useEffect, useRef, useState} from "react";
import History from "../components/wallet/history";
import Send from "../components/wallet/send";
import Receive from "../components/wallet/receive";
import Coins from "../components/wallet/coins";
import Update from "../components/wallet/update";

const StorageKeyWalletTab = "wallet-tab"

const Page = ({tab, page, shown, children}) => {
    const includePage = tab === page || shown.current.includes(page)
    const style = {}
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
    const [connected, setConnected] = useState(false)
    const shownRef = useRef([])
    useEffect(async () => {
        const tab = await window.electron.getWindowStorage(StorageKeyWalletTab) || Tabs.History
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
    return (
        <>
            <Frame selected={tab} clicked={handleClicked} connected={connected}>
                <Page tab={tab} page={Tabs.History} shown={shownRef}><History lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Send} shown={shownRef}><Send/></Page>
                <Page tab={tab} page={Tabs.Receive} shown={shownRef}><Receive/></Page>
                <Page tab={tab} page={Tabs.Addresses} shown={shownRef}><Addresses/></Page>
                <Page tab={tab} page={Tabs.Coins} shown={shownRef}><Coins lastUpdate={lastUpdate}/></Page>
            </Frame>
            <Update setConnected={setConnected} setLastUpdate={setLastUpdate}/>
        </>
    )
}

export default WalletLoaded
