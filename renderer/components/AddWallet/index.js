import {useEffect, useRef, useState} from "react"

const AddWalletHome = ({onAddWallet}) => {
    const [addWalletOption, setAddWalletOption] = useState("")
    const walletInput = useRef()
    const passwordInput = useRef()

    useEffect(() => {

    }, [])

    const handleUserImportingFile = async (walletFile) => {
        const fileContents = await window.electron.getWalletFile(walletFile)
        if (!fileContents.startsWith("{")) {
            setAddWalletOption("importWithPassword")
        } else {
            setAddWalletOption("importWithoutPassword")
        }
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

    const handleClickImport = () => {
        window.electron.listenFile((e, filePath) => {
            walletInput.current.value = filePath
            // async function. Make sure openDialog does not happen before this is done. May be fine as this is only a function definition
            handleUserImportingFile(filePath)
        })
        window.electron.openDialog()
    }

    const handleClickNext = () => {
        let wallet = {
            addWalletMethod: addWalletOption,
            pathToWallet: walletInput.current.value,
        }
        if (addWalletOption === "importWithPassword") {
            wallet.password = passwordInput.current.value;
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
                    <input ref={passwordInput} type="password"/>
                </label>
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
