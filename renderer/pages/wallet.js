import Frame, {Tabs} from "../components/wallet/frame";
import {Addresses, Chat, Coins, History, Memo, Notifications, Receive, Send, Tokens, Update} from "../components/wallet";
import {useEffect, useRef, useState} from "react";
import {Status} from "../components/util/connect"
import ModalViewer from "../components/modal/viewer";
import {Modals} from "../../main/common/util";
import {Utxos} from "../components/util/utxos";
import useNotifications from "../components/wallet/use_notifications";
import styles from "../styles/walletLoading.module.css";

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
    const [syncProgress, setSyncProgress] = useState({
        active: true,
        percent: 0,
        label: "Preparing wallet",
    })
    const shownRef = useRef([])
    // Whether the Notifications tab is currently open, so incoming activity
    // isn't badged or alerted while the user is already reading it.
    const notificationsActiveRef = useRef(false)
    const {notifications, loaded: notificationsLoaded, unreadCount, markRead} =
        useNotifications({lastUpdate, activeRef: notificationsActiveRef, initialSync: syncProgress.active})
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
        window.electron.listenSelectTab((_event, tab) => handleClicked(tab))
    }, [])
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
                   setModal={setModal} unreadCount={unreadCount}>
                <Page tab={tab} page={Tabs.Memo} shown={shownRef}>
                    <Memo lastUpdate={lastUpdate} setModal={setModal} setChatRoom={setChatRoom}/></Page>
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
            </Frame>
            <ModalViewer setLastUpdate={setLastUpdate} setModal={setModal} modalWindow={modalWindow} modalProps={modalProps}
                         setChatRoom={setChatRoom}/>
            <Update setConnected={setConnected} setLastUpdate={setLastUpdate} setSyncProgress={setSyncProgress}/>
            {syncProgress.active && <div className={styles.backdrop} role="status" aria-live="polite">
                <div className={styles.card}>
                    <img src="/memo-logo-large.png" alt="" className={styles.logo}/>
                    <h1>Loading your wallet</h1>
                    <p>{syncProgress.label}</p>
                    <div className={styles.track} role="progressbar" aria-label="Wallet loading progress"
                         aria-valuemin="0" aria-valuemax="100" aria-valuenow={syncProgress.percent}>
                        <div className={styles.fill} style={{width: `${syncProgress.percent}%`}}/>
                    </div>
                    <span>{syncProgress.percent}%</span>
                    <small>A wallet with lots of history may take a few minutes.</small>
                </div>
            </div>}
        </>
    )
}

export default WalletLoaded
