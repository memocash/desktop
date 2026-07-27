import {useRef} from 'react'
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

const Tab = ({selected, name, clicked, title, badge, tabRef, onKeyDown}) => {
    const isSelected = selected === name
    return (
        <div className={[tabs.tab, isSelected && tabs.selected].filter(c => c).join(" ")}>
            <a ref={tabRef} role="tab" aria-selected={isSelected} aria-controls={`panel-${name}`}
               id={`tab-${name}`} tabIndex={isSelected ? 0 : -1} onKeyDown={onKeyDown}
               onClick={() => clicked(name)}>{title}
                {badge ? <span className={tabs.badge} aria-label={`${badge} unread`}>
                    {badge > 99 ? "99+" : badge}</span> : null}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children, connected, lastUpdate, setModal, unreadCount, hiddenTabs = []}) => {
    const tabRefs = useRef({})
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
    const shown = Object.entries(tabTitles).filter(([, name]) => !hiddenTabs.includes(name))
    // Left/right move between tabs and select as they go, the standard tab strip
    // behaviour, so the strip is usable without a mouse.
    const keyDown = (e) => {
        const index = shown.findIndex(([, name]) => name === selected)
        if (index === -1) {
            return
        }
        let next
        switch (e.key) {
            case "ArrowLeft":
                next = (index - 1 + shown.length) % shown.length
                break
            case "ArrowRight":
                next = (index + 1) % shown.length
                break
            case "Home":
                next = 0
                break
            case "End":
                next = shown.length - 1
                break
            default:
                return
        }
        e.preventDefault()
        const name = shown[next][1]
        clicked(name)
        const el = tabRefs.current[name]
        if (el) {
            el.focus()
        }
    }
    return (
        <div className={tabs.container}>
            <div className={tabs.header} role="tablist" aria-label="Wallet sections">
                {shown.map(([title, name]) => {
                    return (<Tab key={name} selected={selected} clicked={clicked} name={name} title={title}
                                 onKeyDown={keyDown} tabRef={el => tabRefs.current[name] = el}
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
