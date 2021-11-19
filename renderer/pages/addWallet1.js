import {useEffect, useRef, useState} from "react"

const AddWallet = () => {
    const [addWalletMethod, setAddWalletMethod] = useState() // check initial value
    const [addSeedMethod, setAddSeedMethod] = useState() // check intial value
    const [importedFilePath, setImportedFilePath] = useState()
    const [createdWallet, setCreatedWallet] = useState()
    const [pane, setPane] = useState()

    const walletNameInput = useRef()

    useEffect(() => {
        window.electron.listenFile((e, filePath) => {
            setImportedFilePath(filePath)
        })
    }, [])

    const handleChooseAddWallet = (e) => {
        setAddWalletMethod(e.target.value)
    };

    const handleChooseAddSeed = (e) => {
        setAddSeedMethod(e.target.value)
    };

    const handleCreateWallet = async () => {
        const walletName = walletNameInput.current.value
        // await window.electron.createFile(walletName)
        // const fileContents = await window.electron.getFile(walletName)
        // setCreatedWallet(fileContents)
        setPane(addSeedOptions)
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

    const addWalletOptions = (
        <div>
            <h2>How would you like to add this wallet?</h2>
            <div onChange={handleChooseAddWallet}>
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

    const seedOptions = {
        create: (
            <div>
                <div>Here is the seed phrase for your new wallet.</div>
                <div>Seed phrase</div>
                <div>Store this seed securely. It will be used to recover your wallet.</div>
            </div>
        ),
        import: (
            <div>
                <div>Enter your 12-word seed phrase.</div>
                <textarea></textarea>
            </div>
        )
    }

    const addSeedOptions = (
        <div>
            <h2>How would you like to add the seed for this wallet?</h2>
            <div onChange={handleChooseAddSeed}>
                <label>Create a new seed
                    <input type="radio" name="seed" value="create" />
                </label>
                <label>I already have a seed
                    <input type="radio" name="seed" value="import" />
                </label>
            </div>
            <div>
                {seedOptions[addSeedMethod]}
            </div>
        </div>
    )

    return (
        <div>
            <a href="/">Home</a>
            <h1>Add a Memo wallet</h1>
            {!pane && addWalletOptions}
            {pane}
        </div>
    )
}

export default AddWallet
