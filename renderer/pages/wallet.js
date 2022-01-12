import Frame, {Tabs} from "../components/wallet/frame";
import Addresses from "../components/wallet/addresses";
import {useState} from "react";
import History from "../components/wallet/history";
import Send from "../components/wallet/send";
import Receive from "../components/wallet/receive";
import Coins from "../components/wallet/coins";

const WalletLoaded = () => {
    const [tab, setTab] = useState(Tabs.Addresses)
    const handleClicked = (tab) => {
        setTab(tab)
    }
    return (
        <Frame selected={tab} clicked={handleClicked}>
            {tab === Tabs.History ? <History/> : null}
            {tab === Tabs.Send ? <Send/> : null}
            {tab === Tabs.Receive ? <Receive/> : null}
            {tab === Tabs.Addresses ? <Addresses/> : null}
            {tab === Tabs.Coins ? <Coins/> : null}
        </Frame>
    )
}

export default WalletLoaded
