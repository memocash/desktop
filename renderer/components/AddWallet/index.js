import {useEffect, useRef, useState} from "react"

const WalletOptions = {
    UnreadableFile: () => {
        return (
            <div>
                Cannot read file
            </div>
        )
    },
    Create: () => {
        return (
            <div>
                This file does not exist. To create a new wallet by this name, press "Next".
            </div>
        )
    },
    ImportWithPassword: ({
        hasEnteredWrongPassword,
        onPasswordChange,
        onPasswordKeyDown,
        passwordInputRef
    }) => {
        return (
            <div>
                <p>This file is encrypted. Enter your password or choose another file.</p>
                <p><label>Password:
                    <input autoFocus ref={passwordInputRef} onChange={onPasswordChange}
                           onKeyDown={onPasswordKeyDown} type="password"/>
                </label></p>
                {hasEnteredWrongPassword && <div>Incorrect password. Please try again.</div>}
            </div>
        )
    },
    ImportWithoutPassword: () => {
        return (
            <div>
                Wallet found. To import it, press "Next".
            </div>
        )
    }
}

const AddWalletHome = ({onCreateWallet, onLoadWallet}) => {
    const [isUnreadableFile, setIsUnreadableFile] = useState(false);
    const [fileExists, setFileExists] = useState(false)
    const [passwordProtectedFile, setPasswordProtectedFile] = useState(false)
    const [walletContents, setWalletContents] = useState("")
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const walletInput = useRef()
    const passwordInput = useRef()

    useEffect(async () => {
        const existingWallets = await window.electron.getExistingWalletFiles()
        let suggestedName = "default_wallet"
        if (await electron.getWindowId() !== 1 && existingWallets.includes(suggestedName)) {
            for (let number = 1; true; number++) {
                suggestedName = "wallet_" + number
                if (!existingWallets.includes(suggestedName)) {
                    break
                }
            }
        }
        walletInput.current.value = suggestedName
        await fileChangeHandler()
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

    const fileChangeHandler = async () => {
        try {
            const fileExists = await window.electron.checkFile(walletInput.current.value)
            if (!fileExists) {
                setFileExists(false)
            } else {
                await loadFile(walletInput.current.value)
            }
            setIsUnreadableFile(false)
        } catch {
            setIsUnreadableFile(true)
        }
    }

    const handleClickImport = async () => {
        window.electron.listenFile((e, filePath) => {
            walletInput.current.value = window.electron.getWalletShort(filePath)
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
            const decryptedWallet = window.electron.decryptWallet(walletContents, password)
            if (!decryptedWallet.startsWith("{")) {
                setHasEnteredWrongPassword(true)
            }
        } catch (err) {
            setHasEnteredWrongPassword(true)
        }
        onLoadWallet(pathname, password)
    }

    const passwordKeyDown = (e) => {
        if (e.keyCode === 13) {
            handleClickNext()
        }
    }

    return (
        <div>
            <div>
                <p>
                    <label>Wallet:
                        <input ref={walletInput} onChange={fileChangeHandler} type="text"/>
                        <button onClick={handleClickImport}>Choose...</button>
                    </label>
                </p>
                {isUnreadableFile ?
                    <WalletOptions.UnreadableFile />
                    : fileExists ?
                        passwordProtectedFile ?
                            <WalletOptions.ImportWithPassword
                                hasEnteredWrongPassword={hasEnteredWrongPassword}
                                onPasswordChange={() => setHasEnteredWrongPassword(false)}
                                onPasswordKeyDown={passwordKeyDown}
                                passwordInputRef={passwordInput}
                            />
                            : <WalletOptions.ImportWithoutPassword />
                        : <WalletOptions.Create />
                }
                <div>
                    <button onClick={handleClickNext} disabled={isUnreadableFile}>Next</button>
                </div>
            </div>
        </div>
    )
}

export default AddWalletHome
