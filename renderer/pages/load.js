import {useRef, useState} from "react"
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
import {SelectNetwork} from "../components/load/network/common"

// The page main opens first, and File > New/Restore opens again: choose or
// create a wallet. It is loaded from disk in a window of its own, and the
// wallet it unlocks or creates opens in another: main opens that window with
// the wallet already in it and closes this one, so nothing here runs on after
// success and no route leads from here to there.
const Load = () => {
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
    // Whether a create is in flight: Finish pressed again while main is still
    // writing the wallet is dropped rather than asking for a second window.
    const creating = useRef(false)
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
        if (creating.current) {
            return
        }
        creating.current = true
        try {
            if (!await selectNetwork()) {
                return
            }
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
            }
        } finally {
            creating.current = false
        }
    }
    // Before a wallet is unlocked or created, never after: the wallet window
    // main opens on success is set onto whatever network this window chose,
    // so the choice has to be made - and the person asked about a server they
    // have not approved - while this window is still the one asking. Main
    // refuses an id that matches no configured network, so the dialog can say
    // so: falling through used to open the wallet with no network set at all,
    // leaving every data call in the window to fail against a network nobody
    // chose.
    const selectNetwork = async () => {
        try {
            await SelectNetwork(networkValueRef.current)
            return true
        } catch (error) {
            window.electron.showMessageDialog("Unable to select network: " + error.message)
            return false
        }
    }
    return (
        <div className={styles.rootPage}>
            <div className={styles.content}>
                <div className={styles.imageWrapper}>
                    <img alt={"Memo logo"} src="../memo-logo-large.png"/>
                </div>
                <div className={styles.main}>
                    {pane === Panes.Step1ChooseFile && <LoadHome setFilePath={setFilePath} selectNetwork={selectNetwork}
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

export default Load
