import {useEffect, useState} from "react"
import {KeyModal, SeedModal} from "../modal";
import tabs from '../../styles/tabs.module.css'
import {StatusBar} from './snippets/status-bar'
import {Modals} from "../../../common/util/modals"

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
    Contacts: "contacts",
}

const Tab = ({selected, name, clicked, title}) => {
    return (
        <div className={[tabs.tab, selected === name && tabs.selected].join(" ")}>
            <a onClick={() => clicked(name)}>{title}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children, connected, lastUpdate}) => {
    const [modal, setModal] = useState(Modals.None)
    useEffect(() => {
        window.electron.listenDisplayModal((e, modal) => setModal(modal))
    }, [])
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                <Tab selected={selected} clicked={clicked} name={Tabs.Contacts} title="Memo"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.History} title="History"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Send} title="Send"/>
                {/*<Tab selected={selected} clicked={clicked} name={Tabs.Receive} title="Receive"/>*/}
                <Tab selected={selected} clicked={clicked} name={Tabs.Addresses} title="Addresses"/>
                <Tab selected={selected} clicked={clicked} name={Tabs.Coins} title="Coins"/>
            </div>
            <div className={tabs.body}>
                {children}
            </div>
            <StatusBar connected={connected} lastUpdate={lastUpdate}/>
            {(modal === Modals.Seed) && <SeedModal onClose={() => setModal(false)}/>}
            {(modal === Modals.Key) && <KeyModal onClose={() => setModal(false)}/>}
        </div>
    )
}

export default Frame
