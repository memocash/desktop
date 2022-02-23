import tabs from '../../styles/tabs.module.css'

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

const Frame = ({selected, clicked, children, connected}) => {
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
                    {connected ?
                        <>Balance: 0 satoshis</>
                        :
                        <>Not connected</>
                    }
                </div>
                <div className={tabs.statusIcons}>
                    <div className={[tabs.statusIcon, connected ? tabs.statusOkay : tabs.statusError].join(" ")}/>
                </div>
            </div>
        </div>
    )
}

export default Frame
