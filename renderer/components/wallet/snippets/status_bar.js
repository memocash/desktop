import {Modals} from "../../../../main/common/util";

const tabs = require("../../../styles/tabs.module.css");
const {useEffect, useState} = require("react");
import {Status} from "../../util/connect"

const StatusBar = ({connected, lastUpdate, setModal}) => {
    const [info, setInfo] = useState({})
    useEffect(async () => {
        const wallet = await window.electron.getWallet()
        const info = await window.electron.getWalletInfo(wallet.addresses.concat(wallet.changeList))
        let allInfo = {
            balance: 0,
            output_count: 0,
            utxo_count: 0,
        }
        for (let i = 0; i < info.length; i++) {
            allInfo.balance += info[i].balance
            allInfo.output_count += info[i].output_count
            allInfo.utxo_count += info[i].utxo_count
        }
        setInfo(allInfo)
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
                    Balance: {info.balance ? info.balance.toLocaleString() : 0} satoshis
                    ({info.output_count ? info.output_count.toLocaleString() : 0} outputs,
                    {} {info.utxo_count ? info.utxo_count.toLocaleString() : 0} utxos)
                </>}
                {(connected === Status.NotConnected) && <>Loading...</>}
                {(connected === Status.Disconnected) && <>Disconnected</>}
            </div>
            <div className={tabs.statusIcons}>
                <div className={[tabs.statusIcon, statusStyle].join(" ")} onClick={() => setModal(Modals.NetworkView)}/>
            </div>
        </div>
    )

}

export {
    StatusBar,
}
