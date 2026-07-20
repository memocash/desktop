import {useEffect, useState} from "react"
import {BsArrowDownCircle, BsBoxArrowInUpRight, BsChatLeft, BsHeart, BsLink45Deg} from "react-icons/bs"
import {TimeSince} from "../util/time"
import {Modals} from "../../../main/common/util"
import styles from "../../styles/notifications.module.css"

const formatTokenAmount = ({amount, decimals}) => {
    const places = decimals || 0
    const value = Number(amount) / Math.pow(10, places)
    return value.toLocaleString(undefined, {maximumFractionDigits: places})
}

// Stable identity for a notification, matching the derived rows in
// GetNotifications (a coin/token/social event keyed by its transaction).
export const notificationKey = (notification) =>
    `${notification.type}-${notification.tx_hash}-${notification.token_hash || ""}`

// Plain-text title/body for a native desktop notification. Mirrors content()
// below, but without JSX so it can cross the IPC boundary to the main process.
export const notificationSummary = (notification) => {
    switch (notification.type) {
        case "coin":
            return {title: "Payment received", body: `Received ${Number(notification.amount).toLocaleString()} sats`}
        case "token":
            return {title: "Tokens received",
                body: `Received ${formatTokenAmount(notification)} ${notification.ticker || "tokens"}`}
        case "reply":
            return {title: "New reply",
                body: `${notification.actor_name} replied to your post${notification.text ? `: ${notification.text}` : ""}`}
        case "like":
            return {title: "New like", body: `${notification.actor_name} liked your post` +
                (notification.amount ? ` and tipped ${Number(notification.amount).toLocaleString()} sats` : "")}
        case "link_request":
            return {title: "Link request", body: `${notification.actor_name} sent you a link request`}
        case "link_accept":
            return {title: "Link accepted", body: `${notification.actor_name} accepted your link request`}
        default:
            return {title: "Memo", body: ""}
    }
}

const Notifications = ({notifications, loaded, setModal}) => {
    const [counter, setCounter] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => setCounter(value => value + 1), 10000)
        return () => clearInterval(interval)
    }, [])

    const openProfile = (event, address) => {
        event.stopPropagation()
        setModal(Modals.ProfileView, {address})
    }
    const openNotification = async (notification) => {
        if (notification.post_tx_hash) {
            setModal(Modals.Post, {txHash: notification.post_tx_hash})
        } else if (notification.actor_address) {
            setModal(Modals.ProfileView, {address: notification.actor_address})
        } else {
            await window.electron.openTransaction({txHash: notification.tx_hash})
        }
    }
    const content = (notification) => {
        switch (notification.type) {
            case "coin":
                return <><strong>Received {notification.amount.toLocaleString()} sats</strong></>
            case "token":
                return <><strong>Received {formatTokenAmount(notification)} {notification.ticker || "tokens"}</strong></>
            case "reply":
                return <><Actor notification={notification} openProfile={openProfile}/> replied to your post</>
            case "like":
                return <><Actor notification={notification} openProfile={openProfile}/> liked your post
                    {notification.amount ? ` and tipped ${notification.amount.toLocaleString()} sats` : ""}</>
            case "link_request":
                return <><Actor notification={notification} openProfile={openProfile}/> sent you a link request</>
            case "link_accept":
                return <><Actor notification={notification} openProfile={openProfile}/> accepted your link request</>
        }
    }
    const icon = (type) => ({
        coin: <BsArrowDownCircle/>, token: <BsArrowDownCircle/>, reply: <BsChatLeft/>, like: <BsHeart/>,
        link_request: <BsLink45Deg/>, link_accept: <BsLink45Deg/>,
    }[type])

    if (!notifications.length) {
        return <p className={styles.message}>{loaded ? "No notifications yet" : "Loading…"}</p>
    }
    return <div className={styles.list}>
        {notifications.map(notification => <button key={`${notification.type}-${notification.tx_hash}-${notification.token_hash || ""}`}
            className={styles.item} onClick={() => openNotification(notification)}>
            <span className={styles.icon}>{icon(notification.type)}</span>
            <span className={styles.content}>
                <span>{content(notification)}</span>
                {notification.text ? <span className={styles.preview}>{notification.text}</span> : null}
            </span>
            <span className={styles.time} title={notification.timestamp || "Unconfirmed"}>
                {notification.timestamp ? TimeSince(notification.timestamp, counter) : "Now"}
            </span>
            <BsBoxArrowInUpRight className={styles.open}/>
        </button>)}
    </div>
}

const Actor = ({notification, openProfile}) => <strong className={styles.actor}
    onClick={(event) => openProfile(event, notification.actor_address)}>{notification.actor_name}</strong>

export default Notifications
