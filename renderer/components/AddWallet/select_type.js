import {useState} from "react"
import styles from "../../styles/addWallet.module.css"

const TypeOptions = {
    Standard: "standard",
    Import: "import",
}

const SelectType = ({onSelectStandard, onSelectImport, onBack}) => {
    const [isStandard, setIsStandard] = useState(true)

    const changeWalletType = (e) => {
        setIsStandard(e.target.value === TypeOptions.Standard)
    }

    const handleClickNext = () => {
        if (isStandard) {
            onSelectStandard()
        } else {
            onSelectImport()
        }
    }

    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Create Wallet</b></div>
                <div className={styles.boxMain}>
                    <p>What kind of wallet do you want to create?</p>
                    <div>
                        <p><label>
                            <input type="radio" name="type" value={TypeOptions.Standard} onChange={changeWalletType}
                                   checked={isStandard}/>
                            Standard wallet
                        </label></p>
                        <p><label>
                            <input type="radio" name="type" value={TypeOptions.Import} onChange={changeWalletType}
                                   checked={!isStandard}/>
                            Import Bitcoin addresses or private keys
                        </label></p>
                    </div>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={handleClickNext}>Next</button>
            </div>
        </div>
    )
}

export default SelectType
