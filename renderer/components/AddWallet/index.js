import {useEffect, useRef, useState} from "react"

const AddWalletHome = ({decryptWallet, onCreateWallet, onLoadWallet}) => {
    const [fileExists, setFileExists] = useState(false)
    const [passwordProtectedFile, setPasswordProtectedFile] = useState(false)
    const [walletContents, setWalletContents] = useState("")
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const walletInput = useRef()
    const passwordInput = useRef()

    useEffect(async () => {
        const existingWallets = await electron.getExistingWalletFiles()
        let suggestedName = "default_wallet"
        if (existingWallets.includes(suggestedName)) {
            for (let number = 1; true; number++) {
                suggestedName = "wallet_" + number
                if (!existingWallets.includes(suggestedName)) {
                    break
                }
            }
        }
        walletInput.current.value = suggestedName
    }, [])

    const loadFile = async (walletFile) => {
        const fileContents = await window.electron.getWalletFile(walletFile)
        setFileExists(true)
        if (!fileContents.startsWith("{")) {
            setPasswordProtectedFile(true)
        } else {
            setPasswordProtectedFile(false)
        }
        setWalletContents(fileContents)
    }

    const fileChangeHandler = async (e) => {
        const fileExists = await window.electron.checkFile(e.target.value)
        if (!fileExists) {
            setFileExists(false)
        } else {
            await loadFile(e.target.value)
        }
    }

    const handleClickImport = async () => {
        window.electron.listenFile((e, filePath) => {
            walletInput.current.value = electron.getWalletShort(filePath)
            loadFile(filePath)
        })
        window.electron.openDialog()
    }

    const handleClickNext = () => {
        const pathname = walletInput.current.value
        if (!fileExists) {
            onCreateWallet(pathname)
            return
        }
        if (!passwordProtectedFile) {
            onLoadWallet(pathname)
            return
        }
        let password;
        try {
            password = passwordInput.current.value
            const decryptedWallet = decryptWallet(walletContents, password)
            if (!decryptedWallet.startsWith("{")) {
                setHasEnteredWrongPassword(true)
            }
        } catch (err) {
            setHasEnteredWrongPassword(true)
        }
        onLoadWallet(pathname, password)
    }

    const WalletOptionsCreate = () => {
        return (
            <div>
                This file does not exist. To create a new wallet by this name, press "Next".
            </div>
        )
    }
    const WalletOptionsImportWithPassword = () => {
        return (
            <div>
                This file is encrypted. Enter password for this wallet.
                <label>Password:
                    <input ref={passwordInput} onChange={() => setHasEnteredWrongPassword(false)}
                           type="password"/>
                </label>
                {hasEnteredWrongPassword && <div>Incorrect password. Please try again.</div>}
            </div>
        )
    }

    const WalletOptionsImportWithoutPassword = () => {
        return (
            <div>
                Wallet found. To import it, press "Next".
            </div>
        )
    }

    return (
        <div>
            <div>
                <label>Wallet:
                    <input ref={walletInput} onChange={fileChangeHandler} type="text"/>
                    <button onClick={handleClickImport}>Choose...</button>
                </label>
                {fileExists ?
                    passwordProtectedFile ? <WalletOptionsImportWithPassword/> : <WalletOptionsImportWithoutPassword/>
                    : <WalletOptionsCreate/>}
                <div>
                    <button onClick={handleClickNext}>Next</button>
                </div>
            </div>
        </div>
    )
}

export default AddWalletHome
