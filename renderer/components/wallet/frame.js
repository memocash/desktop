import tabs from '../../styles/tabs.module.css'
import { IconCircle, IconX } from "../icons"

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
}

const Tab = ({selected, name, clicked, title}) => {
    return (
        <div className={[tabs.tab, selected === name && tabs.selected].join(" ")}>
            <a onClick={() => clicked(name)}>{title}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children}) => {
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                <Tab selected={selected} clicked={clicked} name={Tabs.History} title="History"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Send} title="Send"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Receive} title="Receive"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Addresses} title="Addresses"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Coins} title="Coins"/>
            </div>
            <div className={tabs.body}>
                {children}
            </div>
            <div className={tabs.statusBar}>
                <div className={tabs.statusText}>
                    Balance
                </div>
                <div className={tabs.statusIcons}>
                    <IconCircle />
                    <IconX />
                </div>
            </div>
        </div>
    )
}

export default Frame
