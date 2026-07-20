import {useCallback, useEffect, useRef, useState} from "react"
import GetWallet from "../util/wallet"
import {notificationKey, notificationSummary} from "./notifications"

// Notifications are recomputed from the wallet cache on every sync, so we diff
// each fetch against the keys we've already seen. Brand-new activity raises a
// native desktop alert and, when the user is looking at another tab, bumps the
// unread badge. The first load establishes the baseline of already-seen
// activity, so existing history never alerts or badges on launch.
//
// activeRef reflects whether the Notifications tab is currently open; the caller
// keeps it up to date and calls markRead() when the tab is shown.
const useNotifications = ({lastUpdate, activeRef}) => {
    const [notifications, setNotifications] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const knownRef = useRef(null)

    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const addresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
        const list = await window.electron.getNotifications(addresses)
        setNotifications(list)
        setLoaded(true)
        if (knownRef.current === null) {
            knownRef.current = new Set(list.map(notificationKey))
            return
        }
        const fresh = list.filter(notification => !knownRef.current.has(notificationKey(notification)))
        if (!fresh.length) {
            return
        }
        fresh.forEach(notification => knownRef.current.add(notificationKey(notification)))
        // No need to alert or badge while the user is already reading them.
        if (activeRef.current) {
            return
        }
        if (fresh.length > 3) {
            window.electron.showNotification({title: "Memo", body: `${fresh.length} new notifications`, tab: "notifications"})
        } else {
            fresh.forEach(notification => window.electron.showNotification(
                {...notificationSummary(notification), tab: "notifications"}))
        }
        setUnreadCount(count => count + fresh.length)
    })()}, [lastUpdate])

    const markRead = useCallback(() => setUnreadCount(0), [])
    return {notifications, loaded, unreadCount, markRead}
}

export default useNotifications
