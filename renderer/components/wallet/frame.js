import tabs from '../../styles/tabs.module.css'
import {StatusBar} from './snippets/status_bar'

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
    Tokens: "tokens",
    Memo: "memo",
    Chat: "chat",
    Notifications: "notifications",
}

const Tab = ({selected, name, clicked, title, badge}) => {
    return (
        <div className={[tabs.tab, selected === name && tabs.selected].join(" ")}>
            <a onClick={() => clicked(name)}>{title}
                {badge ? <span className={tabs.badge}>{badge > 99 ? "99+" : badge}</span> : null}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children, connected, lastUpdate, setModal, unreadCount}) => {
    const tabTitles = {
        "Memo": Tabs.Memo,
        "Chat": Tabs.Chat,
        "Notifications": Tabs.Notifications,
        "History": Tabs.History,
        "Send": Tabs.Send,
        //"Receive": Tabs.Receive,
        "Addresses": Tabs.Addresses,
        "Coins": Tabs.Coins,
        "Tokens": Tabs.Tokens,
    }
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                {Object.entries(tabTitles).map(([title, name], index) => {
                    return (<Tab key={index} selected={selected} clicked={clicked} name={name} title={title}
                                 badge={name === Tabs.Notifications ? unreadCount : 0}/>)
                })}
            </div>
            <div className={tabs.body}>
                {children}
            </div>
            <StatusBar connected={connected} lastUpdate={lastUpdate} setModal={setModal}/>
        </div>
    )
}

export default Frame
