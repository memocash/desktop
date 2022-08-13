import tabs from '../../styles/tabs.module.css'
import {StatusBar} from './snippets/status_bar'

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
    Memo: "memo",
    Chat: "chat",
}

const Tab = ({selected, name, clicked, title}) => {
    return (
        <div className={[tabs.tab, selected === name && tabs.selected].join(" ")}>
            <a onClick={() => clicked(name)}>{title}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children, connected, lastUpdate}) => {
    const tabTitles = {
        "Memo": Tabs.Memo,
        "Chat": Tabs.Chat,
        "History": Tabs.History,
        "Send": Tabs.Send,
        //"Receive": Tabs.Receive,
        "Addresses": Tabs.Addresses,
        "Coins": Tabs.Coins,
    }
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                {Object.entries(tabTitles).map(([title, name]) => {
                    return (<Tab selected={selected} clicked={clicked} name={name} title={title}/>)
                })}
            </div>
            <div className={tabs.body}>
                {children}
            </div>
            <StatusBar connected={connected} lastUpdate={lastUpdate}/>
        </div>
    )
}

export default Frame
