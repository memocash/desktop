import Frame, {Tabs} from "../components/wallet/frame";
import {Addresses, Chat, Coins, History, Memo, Receive, Send, Update} from "../components/wallet";
import {useEffect, useRef, useState} from "react";
import {Status} from "../components/util/connect"
import ModalViewer from "../components/modal/viewer";
import {Modals} from "../../main/common/util";
import {Utxos} from "../components/util/utxos";

const StorageKeyWalletTab = "wallet-tab"

const Page = ({tab, page, shown, children}) => {
    const includePage = tab === page || shown.current.includes(page)
    const style = {height: "100%"}
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
    const [modalWindow, setModalWindow] = useState(Modals.None)
    const [modalProps, setModalProps] = useState({})
    const [tab, setTab] = useState("")
    const [lastUpdate, setLastUpdate] = useState("")
    const [connected, setConnected] = useState(Status.NotConnected)
    const [room, setRoom] = useState("")
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
    const setModal = (modalWindow, modalProps = {}) => {
        setModalWindow(modalWindow)
        setModalProps(modalProps)
    }
    const setChatRoom = (room) => {
        setTab(Tabs.Chat)
        setRoom(room)
    }
    return (
        <>
            <Utxos lastUpdate={lastUpdate}/>
            <Frame selected={tab} clicked={handleClicked} connected={connected} lastUpdate={lastUpdate}>
                <Page tab={tab} page={Tabs.Memo} shown={shownRef}>
                    <Memo lastUpdate={lastUpdate} setModal={setModal}/></Page>
                <Page tab={tab} page={Tabs.Chat} shown={shownRef}>
                    <Chat setModal={setModal} room={room} setRoom={setRoom}/></Page>
                <Page tab={tab} page={Tabs.History} shown={shownRef}><History lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Send} shown={shownRef}><Send/></Page>
                <Page tab={tab} page={Tabs.Receive} shown={shownRef}><Receive/></Page>
                <Page tab={tab} page={Tabs.Addresses} shown={shownRef}><Addresses lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Coins} shown={shownRef}><Coins lastUpdate={lastUpdate}/></Page>
            </Frame>
            <ModalViewer setModal={setModal} modalWindow={modalWindow} modalProps={modalProps}
                         setChatRoom={setChatRoom}/>
            <Update setConnected={setConnected} setLastUpdate={setLastUpdate}/>
        </>
    )
}

export default WalletLoaded
