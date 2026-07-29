import {Modals} from "../../../../main/common/util";

const tabs = require("../../../styles/tabs.module.css");
const {useEffect, useState} = require("react");
import {Status} from "../../util/connect"
import GetWallet from "../../util/wallet";
import {useActivity} from "../../util/activity";
import {Spinner} from "../../util/loading";

const StatusLabels = {
    [Status.Connected]: "Connected",
    [Status.NotConnected]: "Connecting",
    [Status.Disconnected]: "Disconnected",
}

// How long a finished action stays on the status bar. Long enough to read what
// just happened, short enough that a stale line isn't mistaken for work still
// going on.
const MessageLingerMs = 5000

// What the app is doing right now, next to the connection light: a spinner
// whenever anything is downloading, and the most recent line from the log. The
// line stays up while work continues and fades a few seconds after the last
// one, so an idle wallet has an idle status bar. It reports the step being
// worked on rather than a percentage of the whole - the startup sync's phases
// are whatever work each one turns out to be for a given wallet, so a number
// weighted across them looked precise without being it.
const ActivityStatus = () => {
    const {entries, running} = useActivity()
    const latest = entries.length ? entries[0] : null
    const [showMessage, setShowMessage] = useState(false)
    useEffect(() => {
        if (!latest) {
            setShowMessage(false)
            return
        }
        setShowMessage(true)
        const timeout = setTimeout(() => setShowMessage(false), MessageLingerMs)
        return () => clearTimeout(timeout)
    }, [latest && latest.id])
    const busy = running.length > 0
    // Clearing the Log tab throws away the entries but not the work: fall back
    // to what's running so a sync in progress never looks like an idle app.
    // Newest first here too - it's the phase that started last that says what
    // the app is on right now.
    const message = latest ? latest.message : (busy ? running[running.length - 1].label : "")
    // Nothing running and nothing recent leaves the corner empty rather than
    // showing an empty pill.
    if (!message || (!busy && !showMessage)) {
        return null
    }
    return (
        <div className={tabs.statusActivity} role="status" aria-live="polite">
            {busy ? <Spinner/> : null}
            <span className={[tabs.statusMessage, !busy && tabs.statusMessageFading].filter(c => c).join(" ")}
                  title={message}>{message}</span>
        </div>
    )
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
            <div className={tabs.statusInfo}>
                {(connected === Status.Connected) && <>
                    Balance: {info.balance ? info.balance.toLocaleString() : 0} satoshis
                    ({info.spendableUtxos ? info.spendableUtxos.toLocaleString() : 0} spendable utxos,
                    {} {info.tokenUtxos ? info.tokenUtxos.toLocaleString() : 0} token utxos)
                </>}
                {(connected === Status.NotConnected) && <>Loading...</>}
                {(connected === Status.Disconnected) && <>Disconnected</>}
            </div>
            <div className={tabs.statusIcons}>
                <ActivityStatus/>
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
