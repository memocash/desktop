import {useEffect, useState} from "react"
import tabs from '../../styles/tabs.module.css'
import {StatusBar} from './snippets/status-bar'
import {Modals} from "../../../main/common/util"
import Find from "../modal/modals/profile/find";

export const Tabs = {
    History: "history",
    Send: "send",
    Receive: "receive",
    Addresses: "addresses",
    Coins: "coins",
    Memo: "memo",
}

const Tab = ({selected, name, clicked, title}) => {
    return (
        <div className={[tabs.tab, selected === name && tabs.selected].join(" ")}>
            <a onClick={() => clicked(name)}>{title}</a>
        </div>
    )
}

const Frame = ({selected, clicked, children, connected, lastUpdate}) => {
    return (
        <div className={tabs.container}>
            <div className={tabs.header}>
                <Tab selected={selected} clicked={clicked} name={Tabs.Memo} title="Memo"/>
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
        </div>
    )
}

export default Frame
