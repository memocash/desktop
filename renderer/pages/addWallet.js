import {useEffect, useRef, useState} from "react"

const AddWallet = () => {
    const [addWalletMethod, setAddWalletMethod] = useState() // check initial value
    const [importedFilePath, setImportedFilePath] = useState()
    const [createdWallet, setCreatedWallet] = useState()

    const walletNameInput = useRef()

    useEffect(() => {
        window.electron.listenFile((e, filePath) => {
            setImportedFilePath(filePath)
        })
    }, [])

    const handleChooseAdd = (e) => {
        setAddWalletMethod(e.target.value)
    };

    const handleCreateWallet = async () => {
        const walletName = walletNameInput.current.value
        await window.electron.createFile(walletName)
        const fileContents = await window.electron.getFile(walletName)
        setCreatedWallet(fileContents)
    };

    const handleClickImport = () => {
        window.electron.openDialog()
    };

    const walletOptions = {
        create: (
            <div>
                <label>Wallet name:
                    <input ref={walletNameInput} type="text" />
                </label>
                <button onClick={handleCreateWallet}>Create</button>
                <div>{createdWallet}</div>
            </div>
        ),
        import: (
            <div>
                <button onClick={handleClickImport}>Import</button>
                <div>{importedFilePath}</div>
            </div>
        )
    }

    return (
        <div>
            <a href="/">Home</a>
            <h1>Add a Memo wallet</h1>
            <h2>How would you like to add this wallet?</h2>
            <div onChange={handleChooseAdd}>
                <label>Create a new Memo wallet
                    <input type="radio" name="wallet" value="create" />
                </label>
                <label>Import an existing Memo wallet
                    <input type="radio" name="wallet" value="import" />
                </label>
            </div>
            <div>
                {walletOptions[addWalletMethod]}
            </div>
        </div>
    )
}

export default AddWallet
