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

    const decryptWallet = (encryptedWallet, inputPassword) => {
        const bytes = CryptoJS.AES.decrypt(encryptedWallet, inputPassword)
        return bytes.toString(CryptoJS.enc.Utf8)
    }

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
        if (password) {
            try {
                walletJson = decryptWallet(walletJson, password)
                await window.electron.setWallet(JSON.parse(walletJson))
            } catch (err) {
                console.log(err)
                return
            }
        }
        router.push("/wallet")
    }

    const onSelectStandard = () => {
        generateSeedPhrase()
        setPane(Panes.Step3SetSeed)
    }

    const onSetKeys = (keys) => {
        setKeyList(keys)
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
        let addressList = []
        if (seedPhrase && seedPhrase.length) {
            const seed = mnemonicToSeedSync(seedPhrase);
            const node = fromSeed(seed);
            for (let i = 0; i < 20; i++) {
                const child = node.derivePath("m/44'/0'/0'/0/" + i);
                addressList.push(ECPair.fromWIF(child.toWIF()).getAddress())
            }
        }
        if (keyList && keyList.length) {
            for (let i = 0; i < keyList.length; i++) {
                addressList.push(ECPair.fromWIF(keyList[i]).getAddress())
            }
        }
        await window.electron.createFile(filePath, seedPhrase, keyList, addressList, password)
        router.push("/wallet")
    }

    return (
        <div>
            <h1>Memo wallet</h1>
            {pane === Panes.Step1ChooseFile &&
            <AddWalletHome
                decryptWallet={decryptWallet}
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
                onSetKeys={onSetKeys}
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
    )
}

export default Index
