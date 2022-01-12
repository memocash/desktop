import Link from 'next/link';
import tabs from '../../styles/tabs.module.css'

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
}

const Frame = (props) => {
    const Tab = (tabProps) => {
        return (
            <div className={props.selected === tabProps.name ? [tabs.tab, tabs.selected].join(" ") : tabs.tab}>
                {tabProps.children}
            </div>
        )
    }
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                <Tab name={Tabs.History}><a onClick={() => props.clicked(Tabs.History)}>History</a></Tab>
                <Tab name={Tabs.Send}><a onClick={() => props.clicked(Tabs.Send)}>Send</a></Tab>
                <Tab name={Tabs.Receive}><a onClick={() => props.clicked(Tabs.Receive)}>Receive</a></Tab>
                <Tab name={Tabs.Addresses}><a onClick={() => props.clicked(Tabs.Addresses)}>Addresses</a></Tab>
                <Tab name={Tabs.Coins}><a onClick={() => props.clicked(Tabs.Coins)}>Coins</a></Tab>
            </div>
            <div className={tabs.body}>
                {props.children}
            </div>
        </div>
    )
}

export default Frame
