const tabs = require("../../../styles/tabs.module.css");
const {useEffect, useState} = require("react");
import {Status} from "../../util/connect"

const StatusBar = ({connected, lastUpdate}) => {
    const [info, setInfo] = useState({})
    useEffect(async () => {
        const wallet = await window.electron.getWallet()
        const info = await window.electron.getWalletInfo(wallet.addresses)
        if (info.length) {
            setInfo(info[0])
        }
    }, [lastUpdate])
    let statusStyle
    switch (connected) {
        case Status.Connected:
            statusStyle = tabs.statusOkay
            break
        case Status.Disconnected:
            statusStyle = tabs.statusError
            break
        case Status.NotConnected:
            statusStyle = tabs.statusConnecting
            break
    }
    return (
        <div className={tabs.statusBar}>
            <div>
                {(connected === Status.Connected) && <>
                    Balance: {info.balance.toLocaleString()} satoshis
                    ({info.output_count.toLocaleString()} outputs, {info.utxo_count.toLocaleString()} utxos)
                </>}
                {(connected === Status.NotConnected) && <>Loading...</>}
                {(connected === Status.Disconnected) && <>Disconnected</>}
            </div>
            <div className={tabs.statusIcons}>
                <div className={[tabs.statusIcon, statusStyle].join(" ")}/>
            </div>
        </div>
    )

}

export {
    StatusBar,
}
