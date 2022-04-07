const tabs = require("../../../styles/tabs.module.css");
const {useEffect, useState} = require("react");

const StatusBar = ({connected, lastUpdate}) => {
    const [info, setInfo] = useState({})
    useEffect(async () => {
        const wallet = await window.electron.getWallet()
        const info = await window.electron.getWalletInfo(wallet.addresses)
        if (info.length) {
            setInfo(info[0])
        }
    }, [lastUpdate])
    return (
        <div className={tabs.statusBar}>
            <div>
                {connected && <>
                    Balance: {info.balance.toLocaleString()} satoshis
                    ({info.output_count.toLocaleString()} outputs, {info.utxo_count.toLocaleString()} utxos)
                </>}
                {!connected && <>Not connected</>}
            </div>
            <div className={tabs.statusIcons}>
                <div className={[tabs.statusIcon, connected ? tabs.statusOkay : tabs.statusError].join(" ")}/>
            </div>
        </div>
    )

}

module.exports = {
    StatusBar,
}
