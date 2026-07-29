import {useEffect, useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import NetworkForm from "./network/form";
import {Panes} from "./common";

const LoadHome = ({setPane, setFilePath, loadWallet, networkValueRef}) => {
    const [isUnreadableFile, setIsUnreadableFile] = useState(false);
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
    // password was right.
    const onLoadWallet = async (pathToWallet, password) => {
        const {error} = await window.electron.unlockWallet(pathToWallet, password)
        if (error) {
            setHasEnteredWrongPassword(true)
            return
        }
        await loadWallet()
    }
    const loadFile = async (walletFile) => {
        setPasswordProtectedFile(await window.electron.isWalletFileEncrypted(walletFile))
        setFileExists(true)
        setIsUnreadableFile(false)
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
        const filepath = await window.electron.openFileDialog()
        if (!filepath.length) {
            return
        }
        walletInput.current.value = window.electron.getWalletShort(filepath)
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
                    {isUnreadableFile ?
                        <div>Cannot read file</div>
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
                <button onClick={handleClickNext} disabled={isUnreadableFile}>Next</button>
            </div>
        </div>
    )
}

export default LoadHome
