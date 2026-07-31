import Frame, {Tabs} from "../components/wallet/frame";
import {Addresses, Chat, Coins, History, Log, Memo, Notifications, Receive, Send, Tokens, Update}
    from "../components/wallet";
import {useEffect, useRef, useState} from "react";
import {Status} from "../components/util/connect"
import ModalViewer from "../components/modal/viewer";
import {DefaultHiddenTabs, Modals} from "../../main/common/util";
import {Utxos} from "../components/util/utxos";
import useNotifications from "../components/wallet/use_notifications";

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
                <div style={style} id={`panel-${page}`} role="tabpanel" aria-labelledby={`tab-${page}`}>
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
    // Tabs the user has switched off in View, starting from the same set the
    // View menu starts unchecked.
    const [hiddenTabs, setHiddenTabs] = useState(DefaultHiddenTabs)
    // Whether the first sync of the session is still running. It no longer
    // covers the window - the status bar and the panes themselves report it in
    // place (see components/wallet/update) - but a couple of behaviours still
    // need to know a wallet is only part loaded: which view the Memo tab opens
    // on, and not raising desktop alerts for history that is merely being
    // downloaded for the first time.
    const [initialSync, setInitialSync] = useState(true)
    const shownRef = useRef([])
    // Whether the Notifications tab is currently open, so incoming activity
    // isn't badged or alerted while the user is already reading it.
    const notificationsActiveRef = useRef(false)
    const {notifications, loaded: notificationsLoaded, unreadCount, markRead} =
        useNotifications({lastUpdate, activeRef: notificationsActiveRef, initialSync})
    useEffect(() => {(async () => {
        const tab = await window.electron.getWindowStorage(StorageKeyWalletTab) || Tabs.Memo

        setTab(tab)
        shownRef.current.push(tab)
    })()}, [])
    useEffect(() => {
        notificationsActiveRef.current = tab === Tabs.Notifications
        if (tab === Tabs.Notifications) {
            markRead()
        }
    }, [tab, markRead])
    const handleClicked = (tab) => {
        setTab(tab)
        window.electron.setWindowStorage(StorageKeyWalletTab, tab)
        if (!shownRef.current.includes(tab)) {
            shownRef.current.push(tab)
        }
    }
    useEffect(() => {
        // Clicking a native notification focuses the window and jumps here.
        window.electron.listenSelectTab((tab) => handleClicked(tab))
        window.electron.listenToggleTab((tab, visible) => {
            setHiddenTabs(current => {
                const hidden = current.filter(name => name !== tab)
                return visible ? hidden : [...hidden, tab]
            })
        })
    }, [])
    useEffect(() => {
        // Don't leave the window on a panel whose tab was just hidden.
        if (hiddenTabs.includes(tab)) {
            handleClicked(Tabs.Memo)
        }
    }, [hiddenTabs, tab])
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
            <Frame selected={tab} clicked={handleClicked} connected={connected} lastUpdate={lastUpdate}
                   setModal={setModal} unreadCount={unreadCount} hiddenTabs={hiddenTabs}>
                <Page tab={tab} page={Tabs.Memo} shown={shownRef}>
                    <Memo lastUpdate={lastUpdate} setModal={setModal} setChatRoom={setChatRoom}
                          initialSync={initialSync}/></Page>
                <Page tab={tab} page={Tabs.Chat} shown={shownRef}>
                    <Chat setModal={setModal} room={room} setRoom={setRoom}/></Page>
                <Page tab={tab} page={Tabs.Notifications} shown={shownRef}>
                    <Notifications notifications={notifications} loaded={notificationsLoaded} setModal={setModal}/></Page>
                <Page tab={tab} page={Tabs.History} shown={shownRef}><History lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Send} shown={shownRef}><Send setModal={setModal}/></Page>
                <Page tab={tab} page={Tabs.Receive} shown={shownRef}><Receive/></Page>
                <Page tab={tab} page={Tabs.Addresses} shown={shownRef}><Addresses lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Coins} shown={shownRef}><Coins lastUpdate={lastUpdate}/></Page>
                <Page tab={tab} page={Tabs.Tokens} shown={shownRef}><Tokens lastUpdate={lastUpdate} setModal={setModal}/></Page>
                <Page tab={tab} page={Tabs.Log} shown={shownRef}><Log/></Page>
            </Frame>
            <ModalViewer setLastUpdate={setLastUpdate} setModal={setModal} modalWindow={modalWindow} modalProps={modalProps}
                         setChatRoom={setChatRoom}/>
            <Update setConnected={setConnected} setLastUpdate={setLastUpdate} setInitialSync={setInitialSync}/>
        </>
    )
}

export default WalletLoaded
