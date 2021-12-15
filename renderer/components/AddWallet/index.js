import {useEffect, useRef, useState} from "react"

const AddWalletHome = ({
    decryptWallet,
    onAddWallet
}) => {
    const [addWalletOption, setAddWalletOption] = useState("")
    const [walletContents, setWalletContents] = useState("")
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const walletInput = useRef()
    const passwordInput = useRef()

    useEffect(async () => {
        const existingWallets = await electron.getExistingWalletFiles()
        let suggestedName = "default_wallet"
        if(existingWallets.includes(suggestedName)) {
            for(let number = 1; true; number++) {
                suggestedName = "wallet_" + number
                if(!existingWallets.includes(suggestedName)) {
                    break
                }
            }
        }
        walletInput.current.value = suggestedName
        setAddWalletOption("create")
    }, [])

    const handleUserImportingFile = async (walletFile) => {
        const fileContents = await window.electron.getWalletFile(walletFile)
        if (!fileContents.startsWith("{")) {
            setAddWalletOption("importWithPassword")
        } else {
            setAddWalletOption("importWithoutPassword")
        }
        setWalletContents(fileContents)
    }

    const handleInputChange = async (e) => {
        if (!e.target.value) {
            setAddWalletOption("")
            return
        }
        const fileExists = await window.electron.checkFile(e.target.value)
        if (!fileExists) {
            setAddWalletOption("create")
        } else {
            handleUserImportingFile(e.target.value)
        }
    }

    const handleEditPassword = () => {
        if(hasEnteredWrongPassword) {
            setHasEnteredWrongPassword(false)
        }
    }

    const handleClickImport = () => {
        window.electron.listenFile((e, filePath) => {
            walletInput.current.value = filePath
            // async function. Make sure openDialog does not happen before this is done. May be fine as this is only a function definition
            handleUserImportingFile(filePath)
        })
        window.electron.openDialog()
    }

    const handleClickNext = () => {
        let password;
        if (addWalletOption === "importWithPassword") {
            try {
                password = passwordInput.current.value
                const decryptedWallet = decryptWallet(walletContents, password)
                if(!decryptedWallet.startsWith("{")) {
                    throw "wrong password"
                }
            } catch(err) {
                setHasEnteredWrongPassword(true)
                return
            }
        }
        const wallet = {
            addWalletMethod: addWalletOption,
            password,
            pathToWallet: walletInput.current.value,
        }
        onAddWallet(wallet)
    }

    const walletOptions = {
        create: (
            <div>
                This file does not exist. To create a new wallet by this name, press "Next".
            </div>
        ),
        importWithPassword: (
            <div>
                This file is encrypted. Enter password for this wallet.
                <label>Password:
                    <input ref={passwordInput} onChange={handleEditPassword} type="password"/>
                </label>
                {hasEnteredWrongPassword &&
                    <div>
                        Incorrect password. Please try again.
                    </div>
                }
            </div>
        ),
        importWithoutPassword: (
            <div>
                Wallet found. To import it, press "Next".
            </div>
        )
    }

    return (
        <div>
            <div>
                <label>Wallet:
                    <input ref={walletInput} onChange={handleInputChange} type="text"/>
                    <button onClick={handleClickImport}>Choose...</button>
                </label>
                {walletOptions[addWalletOption]}
                <div>
                    <button disabled={!addWalletOption} onClick={handleClickNext}>Next</button>
                </div>
            </div>
        </div>
    )
}

export default AddWalletHome
