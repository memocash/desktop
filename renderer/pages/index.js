import {useRef, useState} from "react"
import {useRouter} from "../components/util/router"
import LoadHome from "../components/load"
import AddSeed from "../components/load/add_seed"
import ConfirmSeed from "../components/load/confirm_seed"
import CreatePassword from "../components/load/create_password"
import SelectType from "../components/load/select_type"
import ImportKeys from "../components/load/import_keys";
import styles from "../styles/addWallet.module.css"
import {Panes} from "../components/load/common"
import {WalletErrors} from "../../main/common/util"
import NetworkConfiguration from "../components/load/network/configuration";
import {GetNetworkConfig, SaveNetworkConfig, SetWindowNetwork} from "../components/load/network/common"
import {SelectedNetwork} from "../components/load/network/selector_core"

const Index = () => {
    const router = useRouter()
    const [filePath, setFilePath] = useState()
    const [pane, setPane] = useState(Panes.Step1ChooseFile)
    // Whether the wallet being created is built on a seed. The seed itself
    // stays in main for the whole flow - the panes ask main to generate,
    // import, and confirm it - so all this page keeps is which kind of wallet
    // to ask for at the end.
    const [seedWallet, setSeedWallet] = useState(false)
    const [keyList, setKeyList] = useState([])
    const [addressList, setAddressList] = useState([])
    const networkValueRef = useRef()
    const [_, setCalledPush] = useState(false)
    const onChooseSeedWallet = () => {
        setSeedWallet(true)
        setPane(Panes.Step3SetSeed)
    }
    const onSetKeysAndAddresses = (keys, addresses) => {
        setKeyList(keys)
        setAddressList(addresses)
        setPane(Panes.Step5SetPassword)
    }
    const onBackFromAddSeed = () => {
        setSeedWallet(false)
        setKeyList([])
        setPane(Panes.Step2SelectType)
    }
    const onBackFromCreatePassword = () => {
        if (seedWallet) {
            setPane(Panes.Step3SetSeed)
        } else {
            setKeyList([])
            setPane(Panes.Step3SetKeys)
        }
    }
    const handlePasswordCreated = async (password) => {
        const {error} = await window.electron.createFile(filePath, seedWallet, keyList, addressList, password)
        // Main refuses to write over an existing wallet. This screen is only
        // reached for a name with no file behind it, so getting here means the
        // file appeared in between - opening the wallet would find no wallet.
        // Anything else it refuses for says so in its own words: this is the last
        // step of the creation flow, and a button that did nothing here left the
        // seed just written down belonging to no wallet at all.
        if (error) {
            window.electron.showMessageDialog(error === WalletErrors.WalletExists
                ? "A wallet named " + filePath + " already exists."
                : error)
            return
        }
        await loadWallet()
    }
    const loadWallet = async () => {
        try {
            const networkConfig = await GetNetworkConfig()
            // Throws on a selection that matches no configured network, so the
            // dialog below can say so. Falling through used to open the wallet
            // with no network set at all, leaving every data call in the
            // window to fail against a network nobody chose.
            const {index, option} = SelectedNetwork(networkConfig, networkValueRef.current)
            await SetWindowNetwork(option)
            networkConfig.Last = index
            await SaveNetworkConfig(networkConfig)
        } catch (error) {
            window.electron.showMessageDialog("Unable to select network: " + error.message)
            return
        }
        let calledPushLatest
        setCalledPush(latest => {
            calledPushLatest = latest
            return latest
        });
        if (calledPushLatest) {
            return
        }
        setCalledPush(true)
        await router.push("/wallet")
    }
    return (
        <div className={styles.rootPage}>
            <div className={styles.content}>
                <div className={styles.imageWrapper}>
                    <img alt={"Memo logo"} src="/memo-logo-large.png"/>
                </div>
                <div className={styles.main}>
                    {pane === Panes.Step1ChooseFile && <LoadHome setFilePath={setFilePath} loadWallet={loadWallet}
                                                                 setPane={setPane} networkValueRef={networkValueRef}/>}
                    {pane === Panes.Step2SelectType && <SelectType onChooseSeedWallet={onChooseSeedWallet}
                                                                   setPane={setPane}/>}
                    {pane === Panes.Step3SetKeys && <ImportKeys onSetKeysAndAddresses={onSetKeysAndAddresses}
                                                                onBack={onBackFromAddSeed}/>}
                    {pane === Panes.Step3SetSeed && <AddSeed setPane={setPane} onBack={onBackFromAddSeed}/>}
                    {pane === Panes.Step4ConfirmSeed && <ConfirmSeed setPane={setPane}/>}
                    {pane === Panes.Step5SetPassword && <CreatePassword onPasswordCreated={handlePasswordCreated}
                                                                        onBack={onBackFromCreatePassword}/>}
                    {pane === Panes.NetworkConfiguration && <NetworkConfiguration setPane={setPane}/>}
                </div>
            </div>
        </div>
    )
}

export default Index
