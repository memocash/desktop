import {useState} from "react"
import {useRouter} from "next/router"
import {generateMnemonic} from "bip39"
import LoadHome from "../components/load"
import AddSeed from "../components/load/add_seed"
import ConfirmSeed from "../components/load/confirm_seed"
import CreatePassword from "../components/load/create_password"
import SelectType from "../components/load/select_type"
import ImportKeys from "../components/load/import_keys";
import styles from "../styles/addWallet.module.css"
import {Panes} from "../components/load/common"
import NetworkConfiguration from "../components/load/network/configuration";

const Index = () => {
    const router = useRouter()
    const [filePath, setFilePath] = useState()
    const [pane, setPane] = useState(Panes.Step1ChooseFile)
    const [seedPhrase, setSeedPhrase] = useState("")
    const [keyList, setKeyList] = useState([])
    const [addressList, setAddressList] = useState([])
    const generateSeedPhrase = () => {
        const mnemonic = generateMnemonic()
        setSeedPhrase(mnemonic)
    }
    const onSetKeysAndAddresses = (keys, addresses) => {
        setKeyList(keys)
        setAddressList(addresses)
        setPane(Panes.Step5SetPassword)
    }
    const onBackFromAddSeed = () => {
        setSeedPhrase("")
        setKeyList([])
        setPane(Panes.Step2SelectType)
    }
    const onBackFromCreatePassword = () => {
        if (seedPhrase !== "") {
            generateSeedPhrase()
            setPane(Panes.Step3SetSeed)
        } else {
            setKeyList([])
            setPane(Panes.Step3SetKeys)
        }
    }
    const handlePasswordCreated = async (password) => {
        await window.electron.createFile(filePath, seedPhrase, keyList, addressList, password)
        await router.push("/wallet")
    }
    return (
        <div className={styles.rootPage}>
            <div className={styles.content}>
                <div className={styles.imageWrapper}>
                    <img alt={"Memo logo"} src="/memo-logo-large.png"/>
                </div>
                <div className={styles.main}>
                    {pane === Panes.Step1ChooseFile && <LoadHome setPane={setPane} setFilePath={setFilePath}/>}
                    {pane === Panes.Step2SelectType && <SelectType generateSeedPhrase={generateSeedPhrase}
                                                                   setPane={setPane}/>}
                    {pane === Panes.Step3SetKeys && <ImportKeys onSetKeysAndAddresses={onSetKeysAndAddresses}
                                                                onBack={onBackFromAddSeed}/>}
                    {pane === Panes.Step3SetSeed && <AddSeed setPane={setPane} setSeedPhrase={setSeedPhrase}
                                                             onBack={onBackFromAddSeed} seedPhrase={seedPhrase}/>}
                    {pane === Panes.Step4ConfirmSeed && <ConfirmSeed generateSeedPhrase={generateSeedPhrase}
                                                                     setPane={setPane} seedPhrase={seedPhrase}/>}
                    {pane === Panes.Step5SetPassword && <CreatePassword onPasswordCreated={handlePasswordCreated}
                                                                        onBack={onBackFromCreatePassword}/>}
                    {pane === Panes.NetworkConfiguration && <NetworkConfiguration setPane={setPane}/>}
                </div>
            </div>
        </div>
    )
}

export default Index
