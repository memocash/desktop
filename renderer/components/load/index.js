import {useEffect, useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import NetworkForm from "./network/form";
import {Panes} from "./common";
import {WalletErrors} from "../../../main/common/util"

const LoadHome = ({setPane, setFilePath, loadWallet, networkValueRef}) => {
    // Why this name cannot be opened, rather than only that it cannot. A name
    // with a separator in it and a file this version cannot parse are different
    // problems, and neither is the one the old boolean named.
    const [fileError, setFileError] = useState("")
    const [fileExists, setFileExists] = useState(false)
    const [passwordProtectedFile, setPasswordProtectedFile] = useState(false)
    const [hasEnteredWrongPassword, setHasEnteredWrongPassword] = useState(false)
    const walletInput = useRef()
    const passwordInput = useRef()
    useEffect(() => {(async () => {
        const existingWallets = await window.electron.getExistingWalletFiles()
        let suggestedName = "default_wallet"
        if (await window.electron.getWindowId() !== 1 && existingWallets.includes(suggestedName)) {
            for (let number = 1; true; number++) {
                suggestedName = "wallet_" + number
                if (!existingWallets.includes(suggestedName)) {
                    break
                }
            }
        }
        walletInput.current.value = suggestedName
        await fileChangeHandler()
    })()}, [])
    const onCreateWallet = (pathToWallet) => {
        setFilePath(pathToWallet)
        setPane(Panes.Step2SelectType)
    }
    // Main opens and decrypts the file; the renderer only learns whether the
    // password was right - or, now, that the wallet could not be opened for a
    // reason no password would have fixed, which used to leave Next doing
    // nothing at all.
    const onLoadWallet = async (pathToWallet, password) => {
        const {error} = await window.electron.unlockWallet(pathToWallet, password)
        if (error === WalletErrors.WrongPassword) {
            setHasEnteredWrongPassword(true)
            return
        }
        if (error) {
            setFileError(error)
            return
        }
        await loadWallet()
    }
    // Each of these answers with a result, so the reason a name cannot be used
    // arrives here instead of throwing at the destructuring. Both callers get
    // that for free, which is what the Choose... button was missing.
    const loadFile = async (walletFile) => {
        const {error, value} = await window.electron.isWalletFileEncrypted(walletFile)
        if (error) {
            setFileError(error)
            setFileExists(false)
            return
        }
        setPasswordProtectedFile(value)
        setFileExists(true)
        setFileError("")
    }
    const fileChangeHandler = async () => {
        const walletFile = walletInput.current.value
        const {error, value: exists} = await window.electron.checkFile(walletFile)
        if (error) {
            setFileError(error)
            setFileExists(false)
            return
        }
        if (!exists) {
            setFileExists(false)
            setFileError("")
            return
        }
        await loadFile(walletFile)
    }
    const handleClickImport = async () => {
        const filepath = await window.electron.openFileDialog()
        if (!filepath.length) {
            return
        }
        // Keep the full path. Main grants this window access to the exact file
        // selected by the user; shortening an external path would instead make
        // the next step look for a same-named wallet in the default directory.
        walletInput.current.value = filepath
        await loadFile(filepath)
    }
    const handleClickNext = async () => {
        const pathname = walletInput.current.value
        if (!fileExists) {
            onCreateWallet(pathname)
            return
        }
        if (!passwordProtectedFile) {
            await onLoadWallet(pathname)
            return
        }
        await onLoadWallet(pathname, passwordInput.current.value)
    }
    const passwordKeyDown = async (e) => {
        if (e.keyCode === 13) {
            await handleClickNext()
        }
    }
    const onPasswordChange = () => setHasEnteredWrongPassword(false)
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Memo wallet</b></div>
                <div className={styles.boxMain}>
                    <p>
                        <label>Wallet:
                            <input ref={walletInput} onChange={fileChangeHandler} type="text"/>
                            <button className={styles.buttonChoose} onClick={handleClickImport}>Choose...</button>
                        </label>
                    </p>
                    {fileError ?
                        <div>{fileError}</div>
                        : fileExists ?
                            passwordProtectedFile ?
                                <div>
                                    <p>This file is encrypted. Enter your password or choose another file.</p>
                                    <p><label>Password:
                                        <input autoFocus ref={passwordInput} onChange={onPasswordChange}
                                               onKeyDown={passwordKeyDown} type="password"/>
                                    </label></p>
                                    {hasEnteredWrongPassword && <div>Incorrect password. Please try again.</div>}
                                </div>
                                : <div>Wallet found. To import it, press "Next".</div>
                            : <div>This file does not exist. To create a new wallet by this name, press "Next".</div>
                    }
                    <NetworkForm setPane={setPane} networkValueRef={networkValueRef}/>
                    <p className={styles.warning}>
                        <b>WARNING!</b> This application is experimental and may have catastrophic bugs.
                        Use at your own risk!
                    </p>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={handleClickNext} disabled={!!fileError}>Next</button>
            </div>
        </div>
    )
}

export default LoadHome
