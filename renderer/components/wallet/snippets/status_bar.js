import {Modals} from "../../../../main/common/util";

const tabs = require("../../../styles/tabs.module.css");
const {useEffect, useState} = require("react");
import {Status} from "../../util/connect"
import GetWallet from "../../util/wallet";

const StatusLabels = {
    [Status.Connected]: "Connected",
    [Status.NotConnected]: "Connecting",
    [Status.Disconnected]: "Disconnected",
}

const StatusBar = ({connected, lastUpdate, setModal}) => {
    const [info, setInfo] = useState({})
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const spendableAddresses = wallet.addresses.concat(wallet.changeList || [])
        const balances = await window.electron.getWalletInfo(spendableAddresses)
        const balance = balances.reduce((total, row) => total + row.balance, 0)
        // Coins carrying an SLP amount or a mint baton are held for the token
        // they represent, so they are counted separately from the sats the
        // wallet can actually spend.
        const coins = await window.electron.getCoins(spendableAddresses.concat(wallet.slpList || []))
        let spendableUtxos = 0
        let tokenUtxos = 0
        for (let i = 0; i < coins.length; i++) {
            if (coins[i].slp_token_hash || coins[i].slp_baton_token_hash) {
                tokenUtxos++
            } else if (spendableAddresses.includes(coins[i].address)) {
                spendableUtxos++
            }
        }
        setInfo({balance, spendableUtxos, tokenUtxos})
    })()}, [lastUpdate])
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
    const statusLabel = StatusLabels[connected] || "Unknown"
    return (
        <div className={tabs.statusBar}>
            <div>
                {(connected === Status.Connected) && <>
                    Balance: {info.balance ? info.balance.toLocaleString() : 0} satoshis
                    ({info.spendableUtxos ? info.spendableUtxos.toLocaleString() : 0} spendable utxos,
                    {} {info.tokenUtxos ? info.tokenUtxos.toLocaleString() : 0} token utxos)
                </>}
                {(connected === Status.NotConnected) && <>Loading...</>}
                {(connected === Status.Disconnected) && <>Disconnected</>}
            </div>
            <div className={tabs.statusIcons}>
                <button className={[tabs.statusIcon, statusStyle].join(" ")} title={statusLabel}
                        aria-label={`Network: ${statusLabel}`}
                        onClick={() => setModal(Modals.NetworkView)}/>
            </div>
        </div>
    )

}

export {
    StatusBar,
}
