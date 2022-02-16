import {useState} from "react"
import {useRouter} from "next/router"
import {generateMnemonic, mnemonicToSeedSync, validateMnemonic} from "bip39"
import AddWalletHome from "../components/AddWallet"
import AddSeed from "../components/AddWallet/addSeed"
import ConfirmSeed from "../components/AddWallet/confirmSeed"
import CreatePassword from "../components/AddWallet/createPassword"
import SelectType from "../components/AddWallet/select_type"
import CryptoJS from "crypto-js";
import ImportKeys from "../components/AddWallet/import_keys";
import {fromSeed} from "bip32";
import {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetAddresses from "../components/util/addresses";
import styles from "../styles/addWallet.module.css"

const Panes = {
    Step1ChooseFile: "step1-choose-file",
    Step2SelectType: "step2-select-type",
    Step3SetKeys: "step3-set-keys",
    Step3SetSeed: "step3-set-seed",
    Step4ConfirmSeed: "step4-confirm-seed",
    Step5SetPassword: "step5-set-password",
}

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

    const createWalletStep1 = (pathToWallet) => {
        setFilePath(pathToWallet)
        setPane(Panes.Step2SelectType)
    }

    const loadWallet = async (pathToWallet, password) => {
        let walletJson = await window.electron.getWalletFile(pathToWallet)
        try {
            if (password) {
                walletJson = window.electron.decryptWallet(walletJson, password)
            }
            const wallet = JSON.parse(walletJson)
            await window.electron.setWallet(wallet, pathToWallet, password)
        } catch (err) {
            console.log(err)
            return
        }
        router.push("/wallet")
    }

    const onSelectStandard = () => {
        generateSeedPhrase()
        setPane(Panes.Step3SetSeed)
    }

    const onSetKeysAndAddresses = (keys, addresses) => {
        setKeyList(keys)
        setAddressList(addresses)
        setPane(Panes.Step5SetPassword)
    }

    const onSelectImport = () => {
        setPane(Panes.Step3SetKeys)
    }

    const onBackFromSelectType = () => {
        setPane(Panes.Step1ChooseFile)
    }

    const handleStoredSeed = () => {
        window.electron.clearClipboard()
        setPane(Panes.Step4ConfirmSeed)
    }

    const onBackFromAddSeed = () => {
        setSeedPhrase("")
        setKeyList([])
        setPane(Panes.Step2SelectType)
    }

    const onBackFromConfirmSeed = () => {
        generateSeedPhrase()
        setPane(Panes.Step3SetSeed)
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

    const handleSeedPhraseConfirmed = () => {
        setPane(Panes.Step5SetPassword)
    }

    const handleUserProvidedSeed = (seed) => {
        const isValidSeed = validateMnemonic(seed)
        if (isValidSeed) {
            setSeedPhrase(seed)
            setPane(Panes.Step5SetPassword)
        } else {
            return true
        }
    }

    const handlePasswordCreated = async (password) => {
        await window.electron.createFile(filePath, seedPhrase, keyList, addressList, password)
        router.push("/wallet")
    }

    return (
        <div className={styles.rootPage}>
            <div className={styles.content}>
                <div className={styles.imageWrapper}>
                    <img src="/memo-logo-large.png" width="100"/>
                </div>
                <div className={styles.main}>
                    {pane === Panes.Step1ChooseFile &&
                    <AddWalletHome
                        onCreateWallet={createWalletStep1}
                        onLoadWallet={loadWallet}
                    />
                    }
                    {pane === Panes.Step2SelectType &&
                    <SelectType
                        onBack={onBackFromSelectType}
                        onSelectStandard={onSelectStandard}
                        onSelectImport={onSelectImport}
                    />}
                    {pane === Panes.Step3SetKeys &&
                    <ImportKeys
                        onBack={onBackFromAddSeed}
                        onSetKeysAndAddresses={onSetKeysAndAddresses}
                    />}
                    {pane === Panes.Step3SetSeed &&
                    <AddSeed
                        onStoredSeed={handleStoredSeed}
                        onUserProvidedSeed={handleUserProvidedSeed}
                        onBack={onBackFromAddSeed}
                        seedPhrase={seedPhrase}
                    />
                    }
                    {pane === Panes.Step4ConfirmSeed &&
                    <ConfirmSeed
                        onBack={onBackFromConfirmSeed}
                        onSeedPhraseConfirmed={handleSeedPhraseConfirmed}
                        seedPhrase={seedPhrase}
                    />
                    }
                    {pane === Panes.Step5SetPassword &&
                    <CreatePassword
                        onBack={onBackFromCreatePassword}
                        onPasswordCreated={handlePasswordCreated}
                    />
                    }
                </div>
            </div>
        </div>
    )
}

export default Index
