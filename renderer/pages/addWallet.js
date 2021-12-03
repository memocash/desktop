import {useEffect, useRef, useState} from "react"
import {generateMnemonic} from "bip39"
import AddWalletHome from "../components/AddWallet"
import AddSeed from "../components/AddWallet/addSeed"
import ConfirmSeed from "../components/AddWallet/confirmSeed"
import CreatePassword from "../components/AddWallet/createPassword"
import CryptoJS from "crypto-js";

const AddWallet = () => {
    const [filePath, setFilePath] = useState()
    const [password, setPassword] = useState("")
    const [createdWallet, setCreatedWallet] = useState()
    const [pane, setPane] = useState("add wallet")
    const [seedPhrase, setSeedPhrase] = useState("")
    const [wallet, setWallet] = useState({})

    useEffect(async () => {
        if (pane === "wallet loaded") {
            let walletJson = await window.electron.getWalletFile(filePath)
            if (password) {
                const bytes = CryptoJS.AES.decrypt(walletJson, password)
                walletJson = bytes.toString(CryptoJS.enc.Utf8);
            }
            setWallet(JSON.parse(walletJson))
        }
    }, [pane])

    const handleAddWallet = ({addWalletMethod, pathToWallet, password}) => {
        setFilePath(pathToWallet)
        setPassword(password)
        if (addWalletMethod === "create") {
            generateSeedPhrase()
            setPane("add seed")
        } else {
            setPane("wallet loaded")
        }
    }

    const generateSeedPhrase = () => {
        const mnemonic = generateMnemonic()
        setSeedPhrase(mnemonic)
    }

    // const handleCreateWallet = async () => {
    //     // const walletName = walletNameInput.current.value
    //     // await window.electron.createFile(walletName)
    //     // const fileContents = await window.electron.getFile(walletName)
    //     // setCreatedWallet(fileContents)
    //     generateSeedPhrase()
    //     setPane("add seed")
    // };

    // const handleClickImport = () => {
    //     window.electron.openDialog()
    // };

    const handleStoredSeed = () => {
        window.electron.clearClipboard()
        setPane("confirm seed")
    }

    const seedOnBack = () => {
        setPane("add wallet")
    }

    const handleSeedPhraseConfirmed = () => {
        setPane("create password")
    }

    const handleUserProvidedSeed = (seed) => {
        setSeedPhrase(seed)
        setPane("create password")
    }

    const handlePasswordCreated = async (password) => {
        setPassword(password)
        await window.electron.createFile(filePath, seedPhrase, password)
        setPane("wallet loaded")
    }

    return (
        <div>
            <a href="/">Home</a>
            <h1>Add a Memo wallet</h1>
            {pane === "add wallet" &&
            <AddWalletHome
                onAddWallet={handleAddWallet}
            />
            }
            {pane === "add seed" &&
            <AddSeed
                onStoredSeed={handleStoredSeed}
                onUserProvidedSeed={handleUserProvidedSeed}
                seedOnBack={seedOnBack}
                seedPhrase={seedPhrase}
            />
            }
            {pane === "confirm seed" &&
            <ConfirmSeed
                onSeedPhraseConfirmed={handleSeedPhraseConfirmed}
                seedPhrase={seedPhrase}
            />
            }
            {pane === "create password" &&
            <CreatePassword
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
