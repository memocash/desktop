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
                <Tab name={Tabs.History}><a href={"/wallet"}>History</a></Tab>
                <Tab name={Tabs.Send}><a href={"/send"}>Send</a></Tab>
                <Tab name={Tabs.Receive}><a href={"/wallet"}>Receive</a></Tab>
                <Tab name={Tabs.Addresses}><a href={"/wallet"}>Addresses</a></Tab>
                <Tab name={Tabs.Coins}><a href={"/wallet"}>Coins</a></Tab>
            </div>
            <div className={tabs.body}>
                {props.children}
            </div>
        </div>
    )
}

export default Frame
