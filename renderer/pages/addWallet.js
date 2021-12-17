import {useEffect, useRef, useState} from "react"
import { useRouter } from "next/router"
import { generateMnemonic, validateMnemonic } from "bip39"
import AddWalletHome from "../components/AddWallet"
import AddSeed from "../components/AddWallet/addSeed"
import ConfirmSeed from "../components/AddWallet/confirmSeed"
import CreatePassword from "../components/AddWallet/createPassword"
import CryptoJS from "crypto-js";

const AddWallet = () => {
    const router = useRouter()

    const [filePath, setFilePath] = useState()
    const [password, setPassword] = useState("")
    const [createdWallet, setCreatedWallet] = useState()
    const [pane, setPane] = useState("add wallet")
    const [seedPhrase, setSeedPhrase] = useState("")
    const [wallet, setWallet] = useState({})

    const decryptWallet = (encryptedWallet, inputPassword) => {
        const bytes = CryptoJS.AES.decrypt(encryptedWallet, inputPassword)
        const decryptedWallet = bytes.toString(CryptoJS.enc.Utf8)
        return decryptedWallet
    }

    useEffect(async () => {
        if (pane === "wallet loaded") {
            let walletJson = await window.electron.getWalletFile(filePath)
            if (password) {
                try {
                    walletJson = decryptWallet(walletJson, password)
                } catch(err) {
                    console.log(err)
                }
            }
            setWallet(JSON.parse(walletJson))
        }
    }, [pane])

    const generateSeedPhrase = () => {
        const mnemonic = generateMnemonic()
        setSeedPhrase(mnemonic)
    }

    const handleAddWallet = ({ addWalletMethod, pathToWallet, password }) => {
        setFilePath(pathToWallet)
        if (addWalletMethod === "create") {
            generateSeedPhrase()
            setPane("add seed")
        } else {
            if(password) {
                setPassword(password)
            }
            // setPane("wallet loaded")
            router.push("/wallet")
        }
    }

    const handleStoredSeed = () => {
        window.electron.clearClipboard()
        setPane("confirm seed")
    }

    const onBackFromAddSeed = () => {
        setPane("add wallet")
    }

    const onBackFromConfirmSeed = () => {
        generateSeedPhrase()
        setPane("add seed")
    }

    const onBackFromCreatePassword = () => {
        generateSeedPhrase()
        setPane("add seed")
    }

    const handleSeedPhraseConfirmed = () => {
        setPane("create password")
    }

    const handleUserProvidedSeed = (seed) => {
        const isValidSeed = validateMnemonic(seed)
        if(isValidSeed) {
            setSeedPhrase(seed)
            setPane("create password")
        } else {
            return true
        }
    }

    const handlePasswordCreated = async (password) => {
        setPassword(password)
        await window.electron.createFile(filePath, seedPhrase, password)
        // setPane("wallet loaded")
        router.push("/wallet")
    }

    return (
        <div>
            <a href="/">Home</a>
            <h1>Add a Memo wallet</h1>
            {pane === "add wallet" &&
            <AddWalletHome
                decryptWallet={decryptWallet}
                onAddWallet={handleAddWallet}
            />
            }
            {pane === "add seed" &&
            <AddSeed
                onStoredSeed={handleStoredSeed}
                onUserProvidedSeed={handleUserProvidedSeed}
                onBack={onBackFromAddSeed}
                seedPhrase={seedPhrase}
            />
            }
            {pane === "confirm seed" &&
            <ConfirmSeed
                onBack={onBackFromConfirmSeed}
                onSeedPhraseConfirmed={handleSeedPhraseConfirmed}
                seedPhrase={seedPhrase}
            />
            }
            {pane === "create password" &&
            <CreatePassword
                onBack={onBackFromCreatePassword}
                onPasswordCreated={handlePasswordCreated}
            />
            }
            {pane === "wallet loaded" &&
            <div>
                <p>Wallet date: {wallet.time}</p>
                <p>Wallet seed phrase: {wallet.seed}</p>
                <p>
                    <button onClick={() => setPane("add wallet")}>Back</button>
                </p>
            </div>
            }
        </div>
    )
}

export default AddWallet
