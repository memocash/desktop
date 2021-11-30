import {useEffect, useRef, useState} from "react"
import AddWalletHome from "../components/AddWallet"
import AddSeed from "../components/AddWallet/addSeed"
import ConfirmSeed from "../components/AddWallet/confirmSeed"
import CreatePassword from "../components/AddWallet/createPassword"

const AddWallet = () => {
    const [importedFilePath, setImportedFilePath] = useState()
    const [createdWallet, setCreatedWallet] = useState()
    const [pane, setPane] = useState("add wallet")
    const [seedPhrase, setSeedPhrase] = useState()

    useEffect(() => {
        window.electron.listenFile((e, filePath) => {
            setImportedFilePath(filePath)
        })
    }, [])

    const handleAddWallet = ({ addWalletMethod, pathToWallet }) => {
        if(addWalletMethod === "create") {
            setPane("add seed")
        }
    }

    const generateSeedPhrase = () => {
        // generate seed
        setSeedPhrase("is this Seed Phrase working")
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
                <CreatePassword />
            }
        </div>
    )
}

export default AddWallet
