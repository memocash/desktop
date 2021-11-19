import {useRef, useState} from "react"

const AddWalletHome = ({
    onClickImport,
    onCreateWallet,
    walletNameInput,
}) => {
    const [addWalletMethod, setAddWalletMethod] = useState() // check initial value
    const [fileStatus, setFileStatus] = useState(false)

    const handleChooseAddWallet = (e) => {
        setAddWalletMethod(e.target.value)
    };

    const onChange = (e) => {
        window.electron.checkFile(e.target.value).then((status) => {
            setFileStatus(status)
        })
    }

    const walletOptions = {
        create: (
            <div>
                <label>Wallet name:
                    <input ref={walletNameInput} onChange={onChange} type="text" />
                </label>
                <p>{fileStatus ? "Exists!" : "Doesn't exist!"}</p>
                <button onClick={onCreateWallet}>Create</button>
            </div>
        ),
        import: (
            <div>
                <button onClick={onClickImport}>Import</button>
            </div>
        )
    }

    return (
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
}

export default AddWalletHome
