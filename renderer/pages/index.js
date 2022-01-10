import {useState} from "react"
import {useRouter} from "next/router"
import {generateMnemonic, validateMnemonic} from "bip39"
import AddWalletHome from "../components/AddWallet"
import AddSeed from "../components/AddWallet/addSeed"
import ConfirmSeed from "../components/AddWallet/confirmSeed"
import CreatePassword from "../components/AddWallet/createPassword"
import CryptoJS from "crypto-js";

const Panes = {
    Step1ChooseFile: "step1-choose-file",
    Step2SetSeed: "step2-set-seed",
    Step3ConfirmSeed: "step3-confirm-seed",
    Step4SetPassword: "step4-set-password",
}

const Index = () => {
    const router = useRouter()
    const [filePath, setFilePath] = useState()
    const [pane, setPane] = useState(Panes.Step1ChooseFile)
    const [seedPhrase, setSeedPhrase] = useState("")

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
        generateSeedPhrase()
        setPane(Panes.Step2SetSeed)
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

    const handleStoredSeed = () => {
        window.electron.clearClipboard()
        setPane(Panes.Step3ConfirmSeed)
    }

    const onBackFromAddSeed = () => {
        setPane(Panes.Step1ChooseFile)
    }

    const onBackFromConfirmSeed = () => {
        generateSeedPhrase()
        setPane(Panes.Step2SetSeed)
    }

    const onBackFromCreatePassword = () => {
        generateSeedPhrase()
        setPane(Panes.Step2SetSeed)
    }

    const handleSeedPhraseConfirmed = () => {
        setPane(Panes.Step4SetPassword)
    }

    const handleUserProvidedSeed = (seed) => {
        const isValidSeed = validateMnemonic(seed)
        if (isValidSeed) {
            setSeedPhrase(seed)
            setPane(Panes.Step4SetPassword)
        } else {
            return true
        }
    }

    const handlePasswordCreated = async (password) => {
        await window.electron.createFile(filePath, seedPhrase, password)
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
            {pane === Panes.Step2SetSeed &&
            <AddSeed
                onStoredSeed={handleStoredSeed}
                onUserProvidedSeed={handleUserProvidedSeed}
                onBack={onBackFromAddSeed}
                seedPhrase={seedPhrase}
            />
            }
            {pane === Panes.Step3ConfirmSeed &&
            <ConfirmSeed
                onBack={onBackFromConfirmSeed}
                onSeedPhraseConfirmed={handleSeedPhraseConfirmed}
                seedPhrase={seedPhrase}
            />
            }
            {pane === Panes.Step4SetPassword &&
            <CreatePassword
                onBack={onBackFromCreatePassword}
                onPasswordCreated={handlePasswordCreated}
            />
            }
        </div>
    )
}

export default Index
