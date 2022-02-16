import Link from 'next/link';
import tabs from '../../styles/tabs.module.css'

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
}
const Tab = ({selected, name, children}) => {
    return (
        <div className={selected === name ? [tabs.tab, tabs.selected].join(" ") : tabs.tab}>
            {children}
        </div>
    )
}

const Frame = ({selected, clicked, children}) => {
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                <Tab name={Tabs.History} selected={selected}><a onClick={() => clicked(Tabs.History)}>History</a></Tab>
                <Tab name={Tabs.Send} selected={selected}><a onClick={() => clicked(Tabs.Send)}>Send</a></Tab>
                <Tab name={Tabs.Receive} selected={selected}><a onClick={() => clicked(Tabs.Receive)}>Receive</a></Tab>
                <Tab name={Tabs.Addresses} selected={selected}><a onClick={() => clicked(Tabs.Addresses)}>Addresses</a></Tab>
                <Tab name={Tabs.Coins} selected={selected}><a onClick={() => clicked(Tabs.Coins)}>Coins</a></Tab>
            </div>
            <div className={tabs.body}>
                {children}
            </div>
        </div>
    )
}

export default Frame
