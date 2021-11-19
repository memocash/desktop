import {useRef, useState} from "react"

const AddWalletHome = ({
    onClickImport,
    onCreateWallet,
    walletNameInput,
}) => {
    const [fileStatus, setFileStatus] = useState(false)

    const onChange = (e) => {
        window.electron.checkFile(e.target.value).then((status) => {
            setFileStatus(status)
        })
    }

    return (
        <div>
            <div>
                <label>Wallet name:
                    <input ref={walletNameInput} onChange={onChange} type="text" />
                    <button onClick={onClickImport}>Choose...</button>
                </label>
                <p>{fileStatus ? "Exists!" : "Doesn't exist!"}</p>
                <button onClick={onCreateWallet}>Next</button>
            </div>
        </div>
    )
}

export default AddWalletHome
