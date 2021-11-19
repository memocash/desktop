import {useRef, useState} from "react"

const AddWalletHome = ({
    onClickImport,
    onCreateWallet
}) => {
    const [addWalletMethod, setAddWalletMethod] = useState() // check initial value

    const walletNameInput = useRef()

    const handleChooseAddWallet = (e) => {
        setAddWalletMethod(e.target.value)
    };

    const walletOptions = {
        create: (
            <div>
                <label>Wallet name:
                    <input ref={walletNameInput} type="text" />
                </label>
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
